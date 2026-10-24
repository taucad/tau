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
        return execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
    await assert.rejects(readFile(join(abandoned, 'mirror-ca.key')), { code: 'ENOENT' });
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
    await assert.rejects(readFile(join(first, 'mirror-ca.key')), { code: 'ENOENT' });
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
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { pending: string[]; fingerprint: string };
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
    const macState = { trust: false, certificate: false, failCleanup: true, fingerprint: '' };
    const macOwner: QualificationTlsOwner = {
      platform: 'darwin',
      home: join(mac, 'home'),
      execute(name, args) {
        if (name === 'openssl') {
          return execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        }
        assert.equal(name, 'security');
        if (args[0] === 'add-trusted-cert') {
          macState.trust = true;
          macState.certificate = true;
          macState.fingerprint = new X509Certificate(readFileSync(args.at(-1)!)).fingerprint.replaceAll(':', '');
          throw new Error('Mac import reported failure after mutation');
        }
        if (args[0] === 'remove-trusted-cert') {
          if (macState.failCleanup) {
            throw new Error('Mac trust cleanup temporarily failed');
          }
          macState.trust = false;
          return '';
        }
        if (args[0] === 'find-certificate') {
          return macState.certificate ? `SHA-1 hash: ${macState.fingerprint}` : '';
        }
        if (args[0] === 'delete-certificate') {
          assert.equal(args[2], macState.fingerprint);
          macState.certificate = false;
          return '';
        }
        throw new Error('Unexpected Mac trust command');
      },
    };
    await assert.rejects(prepareQualificationTls(mac, macOwner), AggregateError);
    assert.equal(macState.certificate, false, 'keychain removal attempted despite trust-settings cleanup failure');
    assert.equal(macState.trust, true);
    macState.failCleanup = false;
    await cleanupQualificationTls(mac, macOwner);
    assert.equal(macState.trust, false);
    const windows = join(root, 'windows-partial');
    await mkdir(windows);
    let windowsFingerprint = '';
    const windowsOwner: QualificationTlsOwner = {
      platform: 'win32',
      home: join(windows, 'home'),
      execute(name, args) {
        if (name === 'openssl') {
          return execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
