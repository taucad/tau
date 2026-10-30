/** Real OpenSSL certificates with an isolated fake trust-command owner; never mutates host trust. */
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/* oxlint-disable no-restricted-imports -- Exercise the real acquisition and durable cleanup owner. */
import { cleanupQualificationTls, prepareQualificationTls } from './qualification-tls.mjs';
import type { QualificationTlsOwner } from './qualification-tls.mjs';
/* oxlint-enable no-restricted-imports */
const fixtureOwner = (directory: string) => {
  const state = {
    nss: '',
    system: '',
    nickname: '',
    systemPath: '',
    failImport: false,
    failInstall: false,
    failRemoveNss: false,
    failRemoveSystem: false,
    refreshes: 0,
    calls: [] as string[],
  };
  const owner: QualificationTlsOwner = {
    platform: 'linux',
    home: join(directory, 'home'),
    execute(name, args) {
      state.calls.push(`${name} ${args.join(' ')}`);
      if (name === 'openssl') {
        return execFileSync(name, args, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      }
      if (name === 'certutil') {
        if (args[0] === '-L') {
          if (args.includes('-a')) {
            return state.nss;
          }
          return state.nss ? `${state.nickname} C,,\n` : '';
        }
        if (args[0] === '-A') {
          const journal = JSON.parse(readFileSync(join(directory, 'mirror-trust.json'), 'utf8')) as {
            pending: string[];
          };
          assert.ok(journal.pending.includes('nss'), 'cleanup intent persisted before trust import');
          state.nss = readFileSync(args[args.indexOf('-i') + 1]!, 'utf8');
          state.nickname = args[args.indexOf('-n') + 1]!;
          if (state.failImport) {
            throw new Error('NSS import failed after mutation');
          }
          return '';
        }
        if (args[0] === '-D') {
          assert.equal(args[args.indexOf('-n') + 1], state.nickname);
          if (state.failRemoveNss) {
            throw new Error('NSS cleanup failed');
          }
          state.nss = '';
          return '';
        }
      }
      if (name === 'sudo') {
        assert.equal(args[0], '-n');
        if (args[1] === 'install') {
          state.system = readFileSync(args[4]!, 'utf8');
          state.systemPath = args[5]!;
          if (state.failInstall) {
            throw new Error('System install failed after mutation');
          }
          return '';
        }
        if (args[1] === 'find') {
          return state.system ? state.systemPath : '';
        }
        if (args[1] === 'cat') {
          assert.equal(args[2], state.systemPath);
          return state.system;
        }
        if (args[1] === 'rm') {
          assert.equal(args[3], state.systemPath);
          if (state.failRemoveSystem) {
            throw new Error('System certificate removal failed');
          }
          state.system = '';
          return '';
        }
        if (args[1] === 'update-ca-certificates') {
          state.refreshes++;
          return '';
        }
      }
      throw new Error(`Unexpected trust fixture command ${name} ${args.join(' ')}`);
    },
  };
  return { owner, state };
};
const main = async (): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-tls-test-'));
  const originalHost = process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  const originalVm = process.env['TAU_QUALIFICATION_DISPOSABLE_VM'];
  process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = '1';
  process.env['TAU_QUALIFICATION_DISPOSABLE_VM'] = '1';
  try {
    const abandoned = join(root, 'abandoned-generation');
    await mkdir(abandoned);
    await writeFile(join(abandoned, 'mirror-ca.key'), 'partial private key');
    const abandonedOwner = fixtureOwner(abandoned);
    await cleanupQualificationTls(abandoned, abandonedOwner.owner);
    assert.equal(abandonedOwner.state.calls.length, 0);
    await assert.rejects(readFile(join(abandoned, 'mirror-ca.key')), {
      code: 'ENOENT',
    });
    const first = join(root, 'partial-import');
    await mkdir(first);
    const imported = fixtureOwner(first);
    imported.state.failImport = true;
    await assert.rejects(prepareQualificationTls(first, imported.owner), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[0]), /NSS import failed/u);
      assert.equal(error.errors.length, 1);
      return true;
    });
    assert.equal(imported.state.nss, '');
    await assert.rejects(readFile(join(first, 'mirror-ca.key')), {
      code: 'ENOENT',
    });
    const second = join(root, 'partial-system');
    await mkdir(second);
    const partial = fixtureOwner(second);
    partial.state.failInstall = true;
    partial.state.failRemoveNss = true;
    await assert.rejects(prepareQualificationTls(second, partial.owner), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[0]), /System install failed/u);
      assert.ok(error.errors[1] instanceof AggregateError);
      return true;
    });
    assert.equal(partial.state.system, '', 'system cleanup attempted despite NSS failure');
    assert.equal(partial.state.refreshes, 1, 'system roots refreshed after partial import');
    assert.ok(partial.state.nss);
    const journalPath = join(second, 'mirror-trust.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      pending: string[];
      fingerprint: string;
    };
    assert.deepEqual(journal.pending, ['nss']);
    const originalJournal = await readFile(journalPath, 'utf8');
    await writeFile(journalPath, JSON.stringify({ ...journal, fingerprint: 'A'.repeat(40) }));
    const beforeCalls = partial.state.calls.length;
    await assert.rejects(cleanupQualificationTls(second, partial.owner), /ownership differs/u);
    assert.equal(partial.state.calls.length, beforeCalls, 'changed journal cannot mutate trust');
    await writeFile(journalPath, originalJournal);
    partial.state.failRemoveNss = false;
    await cleanupQualificationTls(second, partial.owner);
    assert.equal(partial.state.nss, '');
    assert.deepEqual(JSON.parse(await readFile(journalPath, 'utf8')).pending, []);
    await cleanupQualificationTls(second, partial.owner);
    const third = join(root, 'success');
    await mkdir(third);
    const successful = fixtureOwner(third);
    const result = await prepareQualificationTls(third, successful.owner);
    assert.match(result.key, /PRIVATE KEY/u);
    assert.match(result.certificate, /CERTIFICATE/u);
    await result.remove();
    assert.equal(successful.state.nss, '');
    assert.equal(successful.state.system, '');
    assert.equal(successful.state.refreshes, 2);
    const retrySystem = join(root, 'system-removal-retry');
    await mkdir(retrySystem);
    const retryOwner = fixtureOwner(retrySystem);
    const retryTrust = await prepareQualificationTls(retrySystem, retryOwner.owner);
    retryOwner.state.failRemoveSystem = true;
    await assert.rejects(retryTrust.remove(), AggregateError);
    assert.ok(retryOwner.state.system, 'failed deletion leaves the run certificate present');
    assert.equal(retryOwner.state.refreshes, 1, 'do not consume the refresh while deletion is pending');
    const retryJournal = JSON.parse(await readFile(join(retrySystem, 'mirror-trust.json'), 'utf8')) as {
      pending: string[];
    };
    assert.deepEqual(retryJournal.pending, ['linuxFile', 'linuxRefresh']);
    retryOwner.state.failRemoveSystem = false;
    await cleanupQualificationTls(retrySystem, retryOwner.owner);
    assert.equal(retryOwner.state.system, '');
    assert.equal(retryOwner.state.refreshes, 2, 'retry refreshes system trust after deleting the certificate');
    const cleanedJournal = JSON.parse(await readFile(join(retrySystem, 'mirror-trust.json'), 'utf8')) as {
      pending: string[];
    };
    assert.deepEqual(cleanedJournal.pending, []);
    const mac = join(root, 'mac-partial');
    await mkdir(mac);
    const macState = {
      certificate: false,
      trusted: false,
      failDelete: true,
      fingerprint: '',
      calls: [] as string[],
    };
    const notTrusted = () =>
      Object.assign(new Error('Command failed: security verify-cert'), {
        stdout: 'Cert Verify Result: CSSMERR_TP_NOT_TRUSTED\n',
      });
    const macOwner: QualificationTlsOwner = {
      platform: 'darwin',
      home: join(mac, 'home'),
      execute(name, args) {
        if (name === 'openssl') {
          return execFileSync(name, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        }
        macState.calls.push(`${name} ${args.join(' ')}`);
        if (name === 'sudo') {
          assert.equal(args[0], '-n');
        }
        const [tool, ...rest] = name === 'sudo' ? args.slice(1) : [name, ...args];
        assert.equal(tool, 'security');
        assert.ok(!rest.includes('remove-trusted-cert'), 'trust-settings removal blocks on a hosted runner');
        if (rest[0] === 'add-trusted-cert') {
          assert.equal(name, 'sudo');
          assert.deepEqual(rest.slice(1, 6), ['-d', '-r', 'trustRoot', '-k', '/Library/Keychains/System.keychain']);
          const journal = JSON.parse(readFileSync(join(mac, 'mirror-trust.json'), 'utf8')) as { pending: string[] };
          assert.deepEqual(journal.pending, ['macSystemTrust'], 'cleanup intent persisted before trust import');
          macState.certificate = true;
          macState.trusted = true;
          macState.fingerprint = new X509Certificate(readFileSync(rest.at(-1)!)).fingerprint.replaceAll(':', '');
          return '';
        }
        if (rest[0] === 'verify-cert') {
          assert.ok(
            rest[2]!.endsWith(join('mac-partial', 'mirror-server.crt')),
            'verify the server leaf as the app sees it',
          );
          assert.deepEqual(rest.slice(3), ['-p', 'ssl', '-s', '127.0.0.1']);
          if (macState.trusted) {
            // The first verification fails after a successful mutation, exercising rollback.
            if (macState.calls.filter((call) => call.includes('verify-cert')).length === 1) {
              throw new Error('Mac verification failed after mutation');
            }
            return '...certificate verification successful.';
          }
          throw notTrusted();
        }
        if (rest[0] === 'find-certificate') {
          assert.equal(rest.at(-1), '/Library/Keychains/System.keychain');
          return macState.certificate ? `SHA-1 hash: ${macState.fingerprint}` : '';
        }
        if (rest[0] === 'delete-certificate') {
          assert.equal(name, 'sudo');
          assert.equal(rest[2], macState.fingerprint);
          if (macState.failDelete) {
            throw new Error('Mac certificate removal temporarily failed');
          }
          macState.certificate = false;
          macState.trusted = false;
          return '';
        }
        throw new Error('Unexpected Mac trust command');
      },
    };
    await assert.rejects(prepareQualificationTls(mac, macOwner), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[0]), /trust verification did not run/u);
      assert.ok(error.errors[1] instanceof AggregateError, 'failed removal is reported, not hidden');
      return true;
    });
    assert.equal(macState.certificate, true, 'failed removal leaves the run certificate present');
    assert.deepEqual(JSON.parse(await readFile(join(mac, 'mirror-trust.json'), 'utf8')).pending, ['macSystemTrust']);
    macState.failDelete = false;
    await cleanupQualificationTls(mac, macOwner);
    assert.equal(macState.certificate, false);
    assert.equal(macState.trusted, false);
    assert.deepEqual(JSON.parse(await readFile(join(mac, 'mirror-trust.json'), 'utf8')).pending, []);
    const macSuccess = join(root, 'mac-success');
    await mkdir(macSuccess);
    let stillTrusted = false;
    let macSuccessFingerprint = '';
    const macSuccessOwner: QualificationTlsOwner = {
      platform: 'darwin',
      home: join(macSuccess, 'home'),
      execute(name, args) {
        if (name === 'openssl') {
          return execFileSync(name, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        }
        const rest = name === 'sudo' ? args.slice(2) : args;
        if (rest[0] === 'add-trusted-cert') {
          macSuccessFingerprint = new X509Certificate(readFileSync(rest.at(-1)!)).fingerprint.replaceAll(':', '');
          stillTrusted = true;
          return '';
        }
        if (rest[0] === 'verify-cert') {
          if (stillTrusted) {
            return '...certificate verification successful.';
          }
          throw notTrusted();
        }
        if (rest[0] === 'find-certificate') {
          return `SHA-1 hash: ${macSuccessFingerprint}`;
        }
        if (rest[0] === 'delete-certificate') {
          // Deletion reports success but trust stays effective: cleanup must refuse to call this clean.
          return '';
        }
        throw new Error('Unexpected Mac trust command');
      },
    };
    const macTrust = await prepareQualificationTls(macSuccess, macSuccessOwner);
    await assert.rejects(macTrust.remove(), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[0]), /still trusted after removal/u);
      return true;
    });
    assert.deepEqual(JSON.parse(await readFile(join(macSuccess, 'mirror-trust.json'), 'utf8')).pending, [
      'macSystemTrust',
    ]);
    const originalServer = await readFile(join(macSuccess, 'mirror-server.crt'), 'utf8');
    await writeFile(join(macSuccess, 'mirror-server.crt'), await readFile(join(mac, 'mirror-server.crt'), 'utf8'));
    stillTrusted = false;
    await assert.rejects(cleanupQualificationTls(macSuccess, macSuccessOwner), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[0]), /did not issue/u);
      return true;
    });
    await writeFile(join(macSuccess, 'mirror-server.crt'), originalServer);
    await cleanupQualificationTls(macSuccess, macSuccessOwner);
    assert.deepEqual(JSON.parse(await readFile(join(macSuccess, 'mirror-trust.json'), 'utf8')).pending, []);
    const macUntrusted = join(root, 'mac-untrusted');
    await mkdir(macUntrusted);
    let macUntrustedFingerprint = '';
    const macUntrustedOwner: QualificationTlsOwner = {
      platform: 'darwin',
      home: join(macUntrusted, 'home'),
      execute(name, args) {
        if (name === 'openssl') {
          return execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        }
        assert.equal(name === 'sudo' ? args[1] : name, 'security');
        const rest = name === 'sudo' ? args.slice(2) : args;
        if (rest[0] === 'add-trusted-cert' || rest[0] === 'delete-certificate') {
          assert.equal(name, 'sudo', 'System keychain mutation runs as root');
        }
        if (rest[0] === 'add-trusted-cert') {
          macUntrustedFingerprint = new X509Certificate(readFileSync(rest.at(-1)!)).fingerprint.replaceAll(':', '');
          return '';
        }
        if (rest[0] === 'verify-cert') {
          // Installation exits 0 but trust never takes effect; the verdict arrives on stderr only.
          throw Object.assign(new Error('Command failed: security verify-cert'), {
            stdout: '',
            stderr: 'Cert Verify Result: CSSMERR_TP_NOT_TRUSTED\n',
          });
        }
        if (rest[0] === 'find-certificate') {
          return macUntrustedFingerprint ? `SHA-1 hash: ${macUntrustedFingerprint}` : '';
        }
        if (rest[0] === 'delete-certificate') {
          macUntrustedFingerprint = '';
          return '';
        }
        throw new Error('Unexpected Mac trust command');
      },
    };
    await assert.rejects(prepareQualificationTls(macUntrusted, macUntrustedOwner), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[0]), /not trusted after installation/u);
      assert.equal(error.errors.length, 1, 'rollback deleted the certificate and verified it untrusted');
      return true;
    });
    assert.equal(macUntrustedFingerprint, '');
    const windows = join(root, 'windows-partial');
    await mkdir(windows);
    let windowsFingerprint = '';
    const windowsOwner: QualificationTlsOwner = {
      platform: 'win32',
      home: join(windows, 'home'),
      execute(name, args) {
        if (name === 'openssl') {
          return execFileSync(name, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        }
        assert.equal(name, 'certutil');
        assert.equal(args[0], '-user');
        assert.equal(args[2], 'Root');
        if (args[1] === '-addstore') {
          windowsFingerprint = new X509Certificate(readFileSync(args[3]!)).fingerprint.replaceAll(':', '');
          throw new Error('Windows import reported failure after mutation');
        }
        if (args[1] === '-store') {
          return `Cert Hash(sha1): ${windowsFingerprint}`;
        }
        if (args[1] === '-delstore') {
          assert.equal(args[3], windowsFingerprint);
          windowsFingerprint = '';
          return '';
        }
        throw new Error('Unexpected Windows trust command');
      },
    };
    await assert.rejects(prepareQualificationTls(windows, windowsOwner), AggregateError);
    assert.equal(windowsFingerprint, '');
    await cleanupQualificationTls(windows, windowsOwner);
    console.log(
      'PASS TLS partial import rollback, independent cleanup, durable exact retry, tamper refusal and private-key cleanup; no host trust changed',
    );
  } finally {
    if (originalHost === undefined) {
      delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
    } else {
      process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = originalHost;
    }
    if (originalVm === undefined) {
      delete process.env['TAU_QUALIFICATION_DISPOSABLE_VM'];
    } else {
      process.env['TAU_QUALIFICATION_DISPOSABLE_VM'] = originalVm;
    }
    await rm(root, { recursive: true, force: true });
  }
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
