import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createFileSecretVault,
  createKeychainSecretVaultWith,
  createMemorySecretVault,
  openSecretVault,
  securityRunner,
} from '#secret-vault.js';
import type { SecretVault, SecretVaultFacts, SecurityCommand, SecurityRunner } from '#secret-vault.js';

const sandboxes: string[] = [];
const sandbox = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-secret-vault-'));
  sandboxes.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

const hex = (value: string): string => Buffer.from(value, 'utf8').toString('hex');
const comment = (facts: SecretVaultFacts): string =>
  `tau1:${Buffer.from(JSON.stringify(facts), 'utf8').toString('base64url')}`;
const pin = `sha256:${'a'.repeat(64)}`;
const name = 'machine/bambu/00M00A391800004';
/** A code with every character `security -i` quoting could trip on. */
const awkwardSecret = String.raw`a@b "c" d\e 'f' #g`;

/**
 * `/usr/bin/security` as the probe on 2026-09-26 observed it: exit 44 for a
 * missing item, `-w` prints the password, attributes print the comment as
 * `"icmt"<blob>=…`, and `security -i` runs one `add-generic-password` line.
 */
const fakeSecurity = (): Readonly<{
  run: SecurityRunner;
  calls: SecurityCommand[];
  items: Map<string, { password: string; label?: string; comment?: string }>;
}> => {
  const items = new Map<string, { password: string; label?: string; comment?: string }>();
  const calls: SecurityCommand[] = [];
  const option = (args: readonly string[], flag: string): string => args[args.indexOf(flag) + 1] ?? '';
  const run: SecurityRunner = async (command) => {
    calls.push(command);
    const [verb = '', ...rest] = command.args;
    if (verb === '-i') {
      const tokens = [...(command.stdin ?? '').trimEnd().matchAll(/"([^"]*)"|(\S+)/gu)].map(
        (match) => match[1] ?? match[2] ?? '',
      );
      const key = `${option(tokens, '-s')}/${option(tokens, '-a')}`;
      if (!tokens.includes('-U') && items.has(key)) {
        return { exitCode: 45, stdout: '' };
      }
      items.set(key, {
        password: Buffer.from(option(tokens, '-X'), 'hex').toString('utf8'),
        label: option(tokens, '-l'),
        comment: option(tokens, '-j'),
      });
      return { exitCode: 0, stdout: '' };
    }
    const key = `${option(rest, '-s')}/${option(rest, '-a')}`;
    const item = items.get(key);
    if (item === undefined) {
      return { exitCode: 44, stdout: '' };
    }
    const attributes = [
      'keychain: "/Users/tester/Library/Keychains/login.keychain-db"',
      'class: "genp"',
      'attributes:',
      `    0x00000007 <blob>="${item.label ?? ''}"`,
      `    "acct"<blob>="${option(rest, '-a')}"`,
      `    "icmt"<blob>=${item.comment === undefined ? '<NULL>' : `"${item.comment}"`}`,
      `    "svce"<blob>="${option(rest, '-s')}"`,
      '',
    ].join('\n');
    if (verb === 'delete-generic-password') {
      items.delete(key);
      return { exitCode: 0, stdout: attributes };
    }
    return { exitCode: 0, stdout: rest.includes('-w') ? `${item.password}\n` : attributes };
  };
  return { run, calls, items };
};

const backends: ReadonlyArray<Readonly<{ kind: string; open: () => Promise<SecretVault> }>> = [
  { kind: 'memory', open: async () => createMemorySecretVault() },
  { kind: 'file', open: async () => createFileSecretVault(join(await sandbox(), 'machines')) },
  { kind: 'keychain', open: async () => createKeychainSecretVaultWith(fakeSecurity().run) },
];

describe.each(backends)('the $kind vault', ({ kind, open }) => {
  it('should report its kind', async () => {
    const vault = await open();
    expect(vault.kind).toBe(kind);
  });

  it('should write, read, report facts, overwrite and remove one secret', async () => {
    const vault = await open();
    await vault.write(name, awkwardSecret, { label: 'Tau: Workshop access code', facts: { mqtt: pin } });
    await vault.write('machine/bambu/other', 'other');
    await expect(vault.facts(name)).resolves.toEqual({ mqtt: pin });
    await expect(vault.read(name)).resolves.toBe(awkwardSecret);
    await vault.write(name, '87654321');
    await expect(vault.read(name)).resolves.toBe('87654321');
    await expect(vault.facts(name)).resolves.toEqual({});
    await expect(vault.remove(name)).resolves.toBe(true);
    await expect(vault.read(name)).resolves.toBeUndefined();
    await expect(vault.facts(name)).resolves.toBeUndefined();
    await expect(vault.remove(name)).resolves.toBe(false);
    await expect(vault.read('machine/bambu/other')).resolves.toBe('other');
  });

  it('should find nothing under a name never written, including object prototype keys', async () => {
    const vault = await open();
    await expect(vault.read('constructor')).resolves.toBeUndefined();
    await expect(vault.facts('toString')).resolves.toBeUndefined();
    await expect(vault.remove('hasOwnProperty')).resolves.toBe(false);
  });

  it.each([
    { case: 'an empty name', name: '', secret: 'code', facts: {} },
    { case: 'a name that reads as a flag', name: '-w', secret: 'code', facts: {} },
    { case: 'a name with a space', name: 'machine/bambu x', secret: 'code', facts: {} },
    { case: 'a 256-character name', name: 'n'.repeat(256), secret: 'code', facts: {} },
    { case: 'an empty secret', name, secret: '', facts: {} },
    { case: 'a 4097-character secret', name, secret: 's'.repeat(4097), facts: {} },
    { case: 'a secret with a newline', name, secret: 'line\nbreak', facts: {} },
    { case: 'a secret outside ASCII', name, secret: 'zugangscode-ü', facts: {} },
    { case: 'an uppercase fact key', name, secret: 'code', facts: JSON.parse('{"Mqtt":"x"}') as SecretVaultFacts },
    { case: 'a fact value outside ASCII', name, secret: 'code', facts: { mqtt: 'ü' } },
    { case: 'a 513-character fact value', name, secret: 'code', facts: { mqtt: 'v'.repeat(513) } },
    {
      case: 'a fact value that is not a string',
      name,
      secret: 'code',
      facts: JSON.parse('{"mqtt":1}') as SecretVaultFacts,
    },
  ])('should refuse $case and save nothing', async (input) => {
    const vault = await open();
    await expect(vault.write(input.name, input.secret, { facts: input.facts })).rejects.toThrow(
      'SECRET_VAULT_VALUE_UNSUPPORTED',
    );
    await expect(vault.read(name)).resolves.toBeUndefined();
  });

  it('should refuse an unsupported name on every read', async () => {
    const vault = await open();
    await expect(vault.read('bad name')).rejects.toThrow('SECRET_VAULT_VALUE_UNSUPPORTED');
    await expect(vault.facts('bad name')).rejects.toThrow('SECRET_VAULT_VALUE_UNSUPPORTED');
    await expect(vault.remove('bad name')).rejects.toThrow('SECRET_VAULT_VALUE_UNSUPPORTED');
  });
});

describe('createKeychainSecretVaultWith', () => {
  it('should send the secret only over stdin, hex-encoded, and read it only with -w', async () => {
    const security = fakeSecurity();
    const vault = createKeychainSecretVaultWith(security.run);
    const secret = awkwardSecret;
    await vault.write(name, secret, { label: 'Tau: "Bob\'s" \\ X1C ü', facts: { mqtt: pin } });
    await vault.facts(name);
    await vault.read(name);
    await vault.remove(name);
    expect(security.calls[0]).toEqual({
      args: ['-i'],
      stdin: `add-generic-password -U -s com.taucad.tau -a ${name} -l "Tau: Bob's  X1C " -j "${comment({ mqtt: pin })}" -X ${hex(secret)}\n`,
    });
    for (const { args } of security.calls) {
      expect(args.join(' ')).not.toContain(secret);
      expect(args.join(' ')).not.toContain(hex(secret));
    }
    expect(security.calls.filter(({ args }) => args.includes('-w'))).toEqual([
      { args: ['find-generic-password', '-s', 'com.taucad.tau', '-a', name, '-w'] },
    ]);
    expect(security.calls.slice(1)).toEqual([
      { args: ['find-generic-password', '-s', 'com.taucad.tau', '-a', name] },
      { args: ['find-generic-password', '-s', 'com.taucad.tau', '-a', name, '-w'] },
      { args: ['delete-generic-password', '-s', 'com.taucad.tau', '-a', name] },
    ]);
  });

  it('should label an item after its name by default under the given service', async () => {
    const security = fakeSecurity();
    await createKeychainSecretVaultWith(security.run, { service: 'com.taucad.tau.test-label' }).write(name, 'code');
    expect(security.items.get(`com.taucad.tau.test-label/${name}`)).toEqual({
      password: 'code',
      label: `Tau: ${name}`,
      comment: comment({}),
    });
  });

  it('should refuse a write whose line security -i would split, before running anything', async () => {
    const security = fakeSecurity();
    const vault = createKeychainSecretVaultWith(security.run);
    await expect(vault.write(name, 's'.repeat(2100))).rejects.toThrow('SECRET_VAULT_VALUE_UNSUPPORTED');
    expect(security.calls).toEqual([]);
    await vault.write(name, 's'.repeat(1500), { facts: { mqtt: pin, camera: pin } });
    await expect(vault.read(name)).resolves.toBe('s'.repeat(1500));
  });

  it.each([
    { operation: 'read', call: async (vault: SecretVault) => vault.read(name) },
    { operation: 'facts', call: async (vault: SecretVault) => vault.facts(name) },
    { operation: 'write', call: async (vault: SecretVault) => vault.write(name, 'code') },
    { operation: 'remove', call: async (vault: SecretVault) => vault.remove(name) },
  ])('should reject $operation with SECRET_VAULT_UNAVAILABLE carrying only the exit code', async ({ call }) => {
    const vault = createKeychainSecretVaultWith(async () => ({ exitCode: 51, stdout: 'password: "hunter2-sentinel"' }));
    try {
      await call(vault);
      expect.fail('should have rejected');
    } catch (error) {
      expect((error as Error).message).toBe('SECRET_VAULT_UNAVAILABLE');
      expect((error as Error).cause).toEqual({ exitCode: 51 });
    }
  });

  it('should read no facts from a missing, foreign or invalid comment', async () => {
    const security = fakeSecurity();
    const vault = createKeychainSecretVaultWith(security.run);
    const entries = [
      ['missing', undefined],
      ['foreign', 'written by someone else'],
      ['garbled', 'tau1:!!!'],
      ['invalid', comment(JSON.parse('{"Mqtt":"x"}') as SecretVaultFacts)],
    ] as const;
    for (const [account, itemComment] of entries) {
      security.items.set(`com.taucad.tau/${account}`, {
        password: 'code',
        ...(itemComment === undefined ? {} : { comment: itemComment }),
      });
    }
    const facts = await Promise.all(entries.map(async ([account]) => vault.facts(account)));
    expect(facts).toEqual([{}, {}, {}, {}]);
  });

  it('should refuse a service outside the name alphabet', () => {
    expect(() => createKeychainSecretVaultWith(fakeSecurity().run, { service: 'com.taucad.tau test' })).toThrow(
      'SECRET_VAULT_VALUE_UNSUPPORTED',
    );
  });
});

describe('securityRunner', () => {
  it('should resolve the exit code and stdout of a child that read its stdin', async () => {
    const run = securityRunner('/bin/sh', 5000);
    await expect(run({ args: ['-c', 'cat; exit 44'], stdin: 'add-generic-password\n' })).resolves.toEqual({
      exitCode: 44,
      stdout: 'add-generic-password\n',
    });
  });

  it.each([
    { case: 'cannot be spawned', executable: '/nonexistent/security', args: [] },
    { case: 'outlives its timeout', executable: '/bin/sh', args: ['-c', 'sleep 5'] },
  ])('should reject SECRET_VAULT_UNAVAILABLE without an exit code when the child $case', async (input) => {
    try {
      await securityRunner(input.executable, 200)({ args: input.args });
      expect.fail('should have rejected');
    } catch (error) {
      expect((error as Error).message).toBe('SECRET_VAULT_UNAVAILABLE');
      expect((error as Error).cause).toStrictEqual({ exitCode: undefined });
    }
  });
});

describe('createFileSecretVault', () => {
  it('should read a first-format file under its legacy keys and keep them when it upgrades', async () => {
    const directory = await sandbox();
    const legacyReference = `secret:${randomUUID()}`;
    await writeFile(
      join(directory, 'secrets.json'),
      JSON.stringify({ v: 1, secrets: { [legacyReference]: '12345678' } }),
      { mode: 0o600 },
    );
    const vault = createFileSecretVault(directory);
    await expect(vault.read(legacyReference)).resolves.toBe('12345678');
    await expect(vault.facts(legacyReference)).resolves.toEqual({});
    await vault.write(name, 'code', { facts: { mqtt: pin } });
    expect(JSON.parse(await readFile(join(directory, 'secrets.json'), 'utf8'))).toEqual({
      v: 2,
      entries: {
        [legacyReference]: { secret: '12345678' },
        [name]: { secret: 'code', label: `Tau: ${name}`, facts: { mqtt: pin } },
      },
    });
    await expect(vault.read(legacyReference)).resolves.toBe('12345678');
  });

  it('should keep secrets.json at mode 0600 inside a 0700 directory', async () => {
    const directory = join(await sandbox(), 'machines');
    await createFileSecretVault(directory).write(name, 'code');
    const [file, folder] = await Promise.all([stat(join(directory, 'secrets.json')), stat(directory)]);
    // oxlint-disable-next-line no-bitwise -- POSIX group/world bits must be absent on protected state.
    expect(file.mode & 0o077).toBe(0);
    // oxlint-disable-next-line no-bitwise -- POSIX group/world bits must be absent on protected state.
    expect(folder.mode & 0o077).toBe(0);
  });

  it('should serialize parallel writes, also across two vaults over one directory', async () => {
    const directory = await sandbox();
    const first = createFileSecretVault(directory);
    const second = createFileSecretVault(directory);
    const names = Array.from({ length: 12 }, (_, index) => `name-${index}`);
    await Promise.all(
      names.map(async (entry, index) => (index % 2 === 0 ? first : second).write(entry, `secret-${index}`)),
    );
    const secrets = await Promise.all(names.map(async (entry) => first.read(entry)));
    expect(secrets).toEqual(names.map((_, index) => `secret-${index}`));
  });

  it('should refuse a damaged file without quoting it', async () => {
    const directory = await sandbox();
    await writeFile(join(directory, 'secrets.json'), '{"v":1,"secrets":{"secret:x":"hunter2-sentinel"', {
      mode: 0o600,
    });
    try {
      await createFileSecretVault(directory).read('secret:x');
      expect.fail('should have rejected');
    } catch (error) {
      expect((error as Error).name).toBe('SyntaxError');
      expect((error as Error).message).not.toContain('hunter2-sentinel');
    }
  });
});

/** The environment of a host started with `TAU_SECRET_VAULT=<kind>`. */
const vaultEnvironment = (kind: string): NodeJS.ProcessEnv =>
  // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable's own name.
  ({ TAU_SECRET_VAULT: kind });

describe('openSecretVault', () => {
  it.each([
    { platform: 'darwin', env: {}, kind: 'keychain' },
    { platform: 'linux', env: {}, kind: 'file' },
    { platform: 'win32', env: vaultEnvironment(''), kind: 'file' },
    { platform: 'darwin', env: vaultEnvironment('file'), kind: 'file' },
    { platform: 'darwin', env: vaultEnvironment('memory'), kind: 'memory' },
    { platform: 'linux', env: vaultEnvironment('keychain'), kind: 'keychain' },
  ] as const)('should open the $kind vault on $platform with $env', ({ platform, env, kind }) => {
    expect(openSecretVault({ directory: '/unused', env, platform }).kind).toBe(kind);
  });

  it('should keep the file vault in the given directory', async () => {
    const directory = await sandbox();
    await openSecretVault({ directory, env: vaultEnvironment('file') }).write(name, 'code');
    await expect(createFileSecretVault(directory).read(name)).resolves.toBe('code');
  });

  it('should refuse an unknown TAU_SECRET_VAULT', () => {
    expect(() => openSecretVault({ directory: '/unused', env: vaultEnvironment('keychian') })).toThrow(
      'SECRET_VAULT_KIND_UNKNOWN',
    );
  });
});

/* Opt-in: creates and deletes one throwaway item in the login keychain under a
 * unique `com.taucad.tau.test-*` service and touches no other item. */
const keychainLive = process.env['TAU_KEYCHAIN_LIVE'] === '1' && process.platform === 'darwin';

describe.skipIf(!keychainLive)('the keychain vault against the login keychain', () => {
  it('should write, read, overwrite and remove one throwaway item without a secret in any argv', async () => {
    const calls: SecurityCommand[] = [];
    const run = securityRunner('/usr/bin/security', 10_000);
    const vault = createKeychainSecretVaultWith(
      async (command) => {
        calls.push(command);
        return run(command);
      },
      { service: `com.taucad.tau.test-${randomUUID()}` },
    );
    const item = 'live/access-code';
    const first = `tau "live" @ ${randomUUID()}`;
    const second = `second-${randomUUID()}`;
    try {
      await vault.write(item, first, { label: 'Tau: live keychain test', facts: { mqtt: pin } });
      await expect(vault.facts(item)).resolves.toEqual({ mqtt: pin });
      await expect(vault.read(item)).resolves.toBe(first);
      await vault.write(item, second);
      await expect(vault.read(item)).resolves.toBe(second);
      await expect(vault.facts(item)).resolves.toEqual({});
      await expect(vault.remove(item)).resolves.toBe(true);
      await expect(vault.read(item)).resolves.toBeUndefined();
      await expect(vault.remove(item)).resolves.toBe(false);
      for (const { args } of calls) {
        for (const secret of [first, second]) {
          expect(args.join(' ')).not.toContain(secret);
          expect(args.join(' ')).not.toContain(hex(secret));
        }
      }
    } finally {
      try {
        await vault.remove(item);
      } catch {
        /* The test's own assertion reports why the keychain was unavailable. */
      }
    }
  });
});
