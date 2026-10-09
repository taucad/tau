/**
 * Host-local custody of named secrets: the macOS login keychain through
 * `/usr/bin/security`, a protected file elsewhere, and memory for tests.
 *
 * Items `/usr/bin/security` creates trust `/usr/bin/security`, so every
 * rebuild of the desktop app, the packaged app and the `tau serve` daemon read
 * them without a keychain prompt. A secret never reaches an argv, an error
 * message or a log; it travels to `security` over stdin, hex-encoded.
 *
 * @public
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

/** Where a vault keeps secrets. @public */
export type SecretVaultKind = 'keychain' | 'file' | 'memory';

/** Non-secret facts saved beside a secret, such as trust pins. @public */
export type SecretVaultFacts = Readonly<Record<string, string>>;

/** What a write saves beside its secret. @public */
export type SecretVaultWriteOptions = Readonly<{
  /**
   * The name a person sees in Keychain Access; defaults to `Tau: <name>`.
   * Characters outside printable ASCII, `"` and `\` are dropped.
   */
  label?: string;
  /** Replaces every fact saved before: keys match `^[a-z][a-z0-9-]{0,63}$`, values are printable ASCII up to 512 characters. */
  facts?: SecretVaultFacts;
}>;

/** Host-local custody of named secrets; nothing here ever reaches a renderer or a log. @public */
export type SecretVault = Readonly<{
  kind: SecretVaultKind;
  /** The secret saved under `name`, or `undefined`. */
  read(name: string): Promise<string | undefined>;
  /** The facts saved beside `name` without reading the secret, or `undefined` when nothing is saved. */
  facts(name: string): Promise<SecretVaultFacts | undefined>;
  /** Create or replace. */
  write(name: string, secret: string, options?: SecretVaultWriteOptions): Promise<void>;
  /** Remove; `false` when nothing was saved. */
  remove(name: string): Promise<boolean>;
}>;

/** One validated entry, as each backend stores it. */
type VaultEntry = Readonly<{ secret: string; label: string; facts: SecretVaultFacts }>;

/** A backend behind the shared validation: every input is already checked. */
type VaultBackend = Readonly<{
  read(name: string): Promise<string | undefined>;
  facts(name: string): Promise<SecretVaultFacts | undefined>;
  write(name: string, entry: VaultEntry): Promise<void>;
  remove(name: string): Promise<boolean>;
}>;

const unsupported = (): Error => new Error('SECRET_VAULT_VALUE_UNSUPPORTED');

/* `cause` carries the exit code only, `undefined` when the child never exited
 * on its own: security's own output can quote the item. */
const unavailable = (exitCode: number | undefined): Error =>
  new Error('SECRET_VAULT_UNAVAILABLE', { cause: { exitCode } });

const namePattern = /^[\dA-Za-z][\w./:-]{0,254}$/u;
const factKeyPattern = /^[a-z][\da-z-]{0,63}$/u;
const printablePattern = /^[\u0020-\u007E]*$/u;

const checkedName = (name: unknown): string => {
  if (typeof name !== 'string' || !namePattern.test(name)) {
    throw unsupported();
  }
  return name;
};

const checkedSecret = (secret: unknown): string => {
  if (typeof secret !== 'string' || secret.length === 0 || secret.length > 4096 || !printablePattern.test(secret)) {
    throw unsupported();
  }
  return secret;
};

const checkedFacts = (facts: unknown): SecretVaultFacts => {
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) {
    throw unsupported();
  }
  const entries: Array<[string, unknown]> = Object.entries(facts);
  const checked: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!factKeyPattern.test(key) || typeof value !== 'string' || value.length > 512 || !printablePattern.test(value)) {
      throw unsupported();
    }
    checked[key] = value;
  }
  return Object.freeze(checked);
};

/* ponytail: a label is only shown to a person, so an unsupported character is
 * dropped rather than refused; a printer named in any script still saves. */
const labelOf = (name: string, label: string | undefined): string => {
  const kept = label?.replaceAll(/[^\u0020-\u007E]|["\\]/gu, '') ?? '';
  return kept.length > 0 ? kept : `Tau: ${name}`;
};

const validated = (kind: SecretVaultKind, backend: VaultBackend): SecretVault =>
  Object.freeze({
    kind,
    read: async (name: string) => backend.read(checkedName(name)),
    facts: async (name: string) => backend.facts(checkedName(name)),
    write: async (name: string, secret: string, options?: SecretVaultWriteOptions) =>
      backend.write(checkedName(name), {
        secret: checkedSecret(secret),
        label: labelOf(name, options?.label),
        facts: checkedFacts(options?.facts ?? {}),
      }),
    remove: async (name: string) => backend.remove(checkedName(name)),
  });

/**
 * Write JSON atomically at mode `0600`: a temporary file renamed over the target.
 *
 * @internal
 * @param path - Target file inside an existing protected directory.
 * @param value - Serializable content.
 */
export const writeProtected = async (path: string, value: unknown): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, undefined, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
};

/**
 * Read one JSON file; `undefined` when it does not exist.
 *
 * @internal
 * @param path - File to read.
 * @returns The parsed content; a parse failure names the file but never quotes it.
 */
export const readJson = async (path: string): Promise<unknown> => {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    /* The parser quotes the text it stopped at, and this file may hold secrets. */
    throw new SyntaxError(`${path} is not valid JSON`);
  }
};

/* One chain per file for every vault over it in this process, so a machine
 * store's legacy view and a file vault over the same directory never
 * interleave a read-modify-write.
 * ponytail: in-process only; two processes sharing one file rely on the
 * atomic rename and can lose a concurrent update. */
const fileChains = new Map<string, Promise<unknown>>();

const serializedOn = async <Result>(path: string, operation: () => Promise<Result>): Promise<Result> => {
  const previous = fileChains.get(path);
  const next = (async (): Promise<Result> => {
    try {
      await previous;
    } catch {
      /* The earlier operation reported its own failure to its own caller. */
    }
    return operation();
  })();
  fileChains.set(path, next);
  return next;
};

const fileEntrySchema = z.strictObject({
  secret: z.string(),
  label: z.string().optional(),
  facts: z.record(z.string(), z.string()).optional(),
});

const secretsFileSchema = z.discriminatedUnion('v', [
  z.strictObject({ v: z.literal(2), entries: z.record(z.string(), fileEntrySchema) }),
  z.strictObject({ v: z.literal(1), secrets: z.record(z.string(), z.string()) }),
]);

type FileEntry = z.infer<typeof fileEntrySchema>;

/**
 * A vault in `secrets.json` under a protected directory: mode `0600`, written
 * by atomic rename, one operation at a time.
 *
 * Reads the first format, `{ v: 1, secrets: { "secret:<uuid>": secret } }`,
 * exposing each entry under its original key with no facts; the first write
 * or removal rewrites the file as `{ v: 2, entries }` and keeps them.
 *
 * ponytail: plaintext at mode `0600`, today's machine-secret custody. The
 * keychain backend is the encrypted one; encrypting this file for a headless
 * daemon is out of scope until one ships without a keychain.
 *
 * @param directory - Protected state directory; created `0700` on first write.
 * @returns The file-backed vault.
 * @public
 *
 * @example <caption>A daemon's vault beside its other protected state</caption>
 * ```typescript
 * import { createFileSecretVault } from '@taucad/host';
 *
 * const vault = createFileSecretVault('/var/lib/tau/machines');
 * await vault.write('machine/acme/SN-0001', '12345678', { label: 'Tau: Workshop printer access code' });
 * ```
 */
export const createFileSecretVault = (directory: string): SecretVault => {
  const path = join(directory, 'secrets.json');
  const load = async (): Promise<Map<string, FileEntry>> => {
    const raw = await readJson(path);
    if (raw === undefined) {
      return new Map();
    }
    const file = secretsFileSchema.parse(raw);
    return file.v === 2
      ? new Map<string, FileEntry>(Object.entries(file.entries))
      : new Map<string, FileEntry>(Object.entries(file.secrets).map(([name, secret]) => [name, { secret }] as const));
  };
  const store = async (entries: Map<string, FileEntry>): Promise<void> => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeProtected(path, { v: 2, entries: Object.fromEntries(entries) });
  };
  return validated('file', {
    read: async (name) =>
      serializedOn(path, async () => {
        const entries = await load();
        return entries.get(name)?.secret;
      }),
    facts: async (name) =>
      serializedOn(path, async () => {
        const entries = await load();
        const entry = entries.get(name);
        return entry === undefined ? undefined : Object.freeze({ ...entry.facts });
      }),
    write: async (name, entry) =>
      serializedOn(path, async () => {
        const entries = await load();
        entries.set(name, entry);
        await store(entries);
      }),
    remove: async (name) =>
      serializedOn(path, async () => {
        const entries = await load();
        if (!entries.delete(name)) {
          return false;
        }
        await store(entries);
        return true;
      }),
  });
};

/**
 * A vault in this process's memory, for tests and throwaway hosts.
 *
 * @returns An empty vault with the same validation as the others.
 * @public
 *
 * @example <caption>A machine host under test</caption>
 * ```typescript
 * import { createMachineSecretStore, createMemorySecretVault } from '@taucad/host';
 *
 * const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
 * ```
 */
export const createMemorySecretVault = (): SecretVault => {
  const entries = new Map<string, VaultEntry>();
  return validated('memory', {
    read: async (name) => entries.get(name)?.secret,
    facts: async (name) => entries.get(name)?.facts,
    write: async (name, entry) => {
      entries.set(name, entry);
    },
    remove: async (name) => entries.delete(name),
  });
};

/** One `/usr/bin/security` invocation: its arguments and what to write to its stdin. @internal */
export type SecurityCommand = Readonly<{ args: readonly string[]; stdin?: string }>;

/** A finished invocation; one that never exits normally rejects `SECRET_VAULT_UNAVAILABLE` instead. @internal */
export type SecurityOutcome = Readonly<{ exitCode: number; stdout: string }>;

/** Runs one `security` invocation; the seam tests replace to record argv and stdin. @internal */
export type SecurityRunner = (command: SecurityCommand) => Promise<SecurityOutcome>;

/**
 * Run one executable the way the keychain vault runs `/usr/bin/security`:
 * no shell, bounded output, killed after `securityTimeout`.
 *
 * @internal
 * @param executable - Absolute path, never looked up on `PATH`.
 * @param securityTimeout - Milliseconds before the child is killed.
 * @returns A runner resolving each invocation's exit code and stdout.
 */
export const securityRunner =
  (executable: string, securityTimeout: number): SecurityRunner =>
  async ({ args, stdin }) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        executable,
        args,
        { encoding: 'utf8', maxBuffer: 64 * 1024, timeout: securityTimeout },
        (error, stdout) => {
          if (error === null) {
            resolve({ exitCode: 0, stdout });
            return;
          }
          /* A spawn failure, the timeout and an oversized stdout carry no exit code. */
          if (typeof error.code === 'number' && error.killed !== true) {
            resolve({ exitCode: error.code, stdout });
            return;
          }
          reject(unavailable(undefined));
        },
      );
      /* A child that exits before reading stdin must not crash the host with EPIPE. */
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(stdin ?? '');
    });

/** Milliseconds. A locked keychain can block `security` on a prompt nobody sees. */
const keychainTimeout = 10_000;
const runSecurity = securityRunner('/usr/bin/security', keychainTimeout);

/* `security -i` reads one command per 4096-byte buffer. A longer line is split
 * and its first part still runs, saving a truncated secret (measured
 * 2026-09-26, Darwin 25), so a write whose line does not fit is refused. */
const securityLineLimit = 4095;

/** `errSecItemNotFound` as `security` reports it. */
const itemNotFound = 44;

const commentPattern = /^\s*"icmt"<blob>="tau1:([\w-]*)"$/mu;

const factsOf = (attributes: string): SecretVaultFacts => {
  const encoded = commentPattern.exec(attributes)?.[1];
  if (encoded === undefined) {
    return Object.freeze({});
  }
  try {
    return checkedFacts(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  } catch {
    /* A comment this vault did not write reads as no facts, so a pin check fails closed. */
    return Object.freeze({});
  }
};

/**
 * The keychain vault over an injected runner.
 *
 * @internal
 * @param run - Runs one `security` invocation.
 * @param options - Keychain service; defaults to `com.taucad.tau`.
 * @returns The keychain-backed vault.
 */
export const createKeychainSecretVaultWith = (
  run: SecurityRunner,
  options?: Readonly<{ service?: string }>,
): SecretVault => {
  const service = checkedName(options?.service ?? 'com.taucad.tau');
  const found = <Value>(outcome: SecurityOutcome, value: () => Value): Value | undefined => {
    if (outcome.exitCode === itemNotFound) {
      return undefined;
    }
    if (outcome.exitCode !== 0) {
      throw unavailable(outcome.exitCode);
    }
    return value();
  };
  return validated('keychain', {
    read: async (name) => {
      const outcome = await run({ args: ['find-generic-password', '-s', service, '-a', name, '-w'] });
      return found(outcome, () => outcome.stdout.replace(/\n$/u, ''));
    },
    facts: async (name) => {
      const outcome = await run({ args: ['find-generic-password', '-s', service, '-a', name] });
      return found(outcome, () => factsOf(outcome.stdout));
    },
    write: async (name, { secret, label, facts }) => {
      const comment = `tau1:${Buffer.from(JSON.stringify(facts), 'utf8').toString('base64url')}`;
      const hex = Buffer.from(secret, 'utf8').toString('hex');
      const line = `add-generic-password -U -s ${service} -a ${name} -l "${label}" -j "${comment}" -X ${hex}\n`;
      if (line.length > securityLineLimit) {
        throw unsupported();
      }
      const outcome = await run({ args: ['-i'], stdin: line });
      if (outcome.exitCode !== 0) {
        throw unavailable(outcome.exitCode);
      }
    },
    remove: async (name) => {
      const outcome = await run({ args: ['delete-generic-password', '-s', service, '-a', name] });
      return found(outcome, () => true) ?? false;
    },
  });
};

/**
 * A vault in the macOS login keychain: generic passwords under one service,
 * the secret's name as the account, facts in the item's comment.
 *
 * Every operation runs `/usr/bin/security`; a write sends one
 * `add-generic-password -U … -X <hex>` line over `security -i`'s stdin, so
 * the secret never appears in an argv. Exit 44 means nothing is saved; a
 * spawn failure, a 10 s timeout or any other exit rejects
 * `SECRET_VAULT_UNAVAILABLE` with only `{ exitCode }` as its cause. A write
 * whose command line exceeds the 4095 bytes `security -i` reads at once
 * rejects `SECRET_VAULT_VALUE_UNSUPPORTED` instead of saving a truncated
 * secret; up to 1,600 characters fit beside the default label and two
 * certificate pins.
 *
 * @param options - Keychain service; defaults to `com.taucad.tau`.
 * @returns The keychain-backed vault.
 * @public
 *
 * @example <caption>Save a printer's access code beside its certificate pin</caption>
 * ```typescript
 * import { createKeychainSecretVault } from '@taucad/host';
 *
 * const vault = createKeychainSecretVault();
 * await vault.write('machine/acme/SN-0001', '12345678', {
 *   label: 'Tau: Workshop printer access code',
 *   facts: { mqtt: 'sha256:7742e457' },
 * });
 * ```
 */
export const createKeychainSecretVault = (options?: Readonly<{ service?: string }>): SecretVault =>
  createKeychainSecretVaultWith(runSecurity, options);

/**
 * Open this host's vault: the keychain on macOS, the protected file
 * elsewhere. `TAU_SECRET_VAULT=keychain|file|memory` overrides the choice,
 * e.g. so automated runs never touch a person's keychain; any other value
 * throws `SECRET_VAULT_KIND_UNKNOWN`.
 *
 * @param options - The file backend's directory, and the environment and platform to decide by.
 * @returns The selected vault; nothing is read until its first operation.
 * @public
 *
 * @example <caption>The desktop services utility's vault</caption>
 * ```typescript
 * import { join } from 'node:path';
 * import { createMachineSecretStore, openSecretVault } from '@taucad/host';
 *
 * const directory = join('/Users/ada/Library/Application Support/Tau', 'machines');
 * const secrets = createMachineSecretStore({ vault: openSecretVault({ directory }), legacyDirectory: directory });
 * ```
 */
export const openSecretVault = (
  options: Readonly<{ directory: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform }>,
): SecretVault => {
  const requested = (options.env ?? process.env)['TAU_SECRET_VAULT'];
  const platformKind = (options.platform ?? process.platform) === 'darwin' ? 'keychain' : 'file';
  const kind = requested === undefined || requested === '' ? platformKind : requested;
  switch (kind) {
    case 'keychain': {
      return createKeychainSecretVault();
    }
    case 'file': {
      return createFileSecretVault(options.directory);
    }
    case 'memory': {
      return createMemorySecretVault();
    }
    default: {
      throw new Error('SECRET_VAULT_KIND_UNKNOWN');
    }
  }
};
