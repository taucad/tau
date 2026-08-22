import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureMkcertStorageWritableForRegeneration,
  migrateLegacyMkcertStorage,
} from '#lib/certificates/mkcert-storage.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('mkcert storage migration', () => {
  it('moves the existing CA identity into persistent storage', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tau-mkcert-storage-'));
    temporaryRoots.push(root);
    const legacyPath = path.join(root, 'legacy');
    const savePath = path.join(root, 'data', 'mkcert');
    mkdirSync(legacyPath, { recursive: true });
    writeFileSync(path.join(legacyPath, 'rootCA.pem'), 'same-ca');
    writeFileSync(path.join(legacyPath, 'rootCA-key.pem'), 'same-key');

    expect(migrateLegacyMkcertStorage(legacyPath, savePath)).toBe(true);
    expect(readFileSync(path.join(savePath, 'rootCA.pem'), 'utf8')).toBe('same-ca');
    expect(() => readFileSync(path.join(legacyPath, 'rootCA.pem'))).toThrow();
  });

  it('refuses to discard a different legacy CA identity', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tau-mkcert-storage-'));
    temporaryRoots.push(root);
    const legacyPath = path.join(root, 'legacy');
    const savePath = path.join(root, 'data', 'mkcert');
    mkdirSync(legacyPath, { recursive: true });
    mkdirSync(savePath, { recursive: true });
    writeFileSync(path.join(legacyPath, 'rootCA.pem'), 'legacy-ca');
    writeFileSync(path.join(savePath, 'rootCA.pem'), 'persistent-ca');

    expect(() => migrateLegacyMkcertStorage(legacyPath, savePath)).toThrow('Conflicting mkcert identities');
    expect(readFileSync(path.join(legacyPath, 'rootCA.pem'), 'utf8')).toBe('legacy-ca');
  });

  it('removes a byte-identical duplicate CA identity', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tau-mkcert-storage-'));
    temporaryRoots.push(root);
    const legacyPath = path.join(root, 'legacy');
    const savePath = path.join(root, 'data', 'mkcert');
    mkdirSync(legacyPath, { recursive: true });
    mkdirSync(savePath, { recursive: true });
    for (const fileName of ['rootCA.pem', 'rootCA-key.pem']) {
      writeFileSync(path.join(legacyPath, fileName), fileName);
      writeFileSync(path.join(savePath, fileName), fileName);
    }

    expect(migrateLegacyMkcertStorage(legacyPath, savePath)).toBe(true);
    expect(() => readFileSync(path.join(legacyPath, 'rootCA.pem'))).toThrow();
  });

  it('refuses to discard a different private key for the same CA certificate', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tau-mkcert-storage-'));
    temporaryRoots.push(root);
    const legacyPath = path.join(root, 'legacy');
    const savePath = path.join(root, 'data', 'mkcert');
    mkdirSync(legacyPath, { recursive: true });
    mkdirSync(savePath, { recursive: true });
    writeFileSync(path.join(legacyPath, 'rootCA.pem'), 'same-ca');
    writeFileSync(path.join(savePath, 'rootCA.pem'), 'same-ca');
    writeFileSync(path.join(legacyPath, 'rootCA-key.pem'), 'legacy-key');
    writeFileSync(path.join(savePath, 'rootCA-key.pem'), 'persistent-key');

    expect(() => migrateLegacyMkcertStorage(legacyPath, savePath)).toThrow('Conflicting mkcert identities');
    expect(readFileSync(path.join(legacyPath, 'rootCA-key.pem'), 'utf8')).toBe('legacy-key');
  });

  it.runIf(process.platform !== 'win32')('keeps private keys owner-only before regeneration', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tau-mkcert-storage-'));
    temporaryRoots.push(root);
    const savePath = path.join(root, 'mkcert');
    mkdirSync(savePath);
    writeFileSync(path.join(savePath, 'rootCA-key.pem'), 'ca-key', { mode: 0o644 });
    writeFileSync(path.join(savePath, 'dev.key'), 'dev-key', { mode: 0o644 });

    ensureMkcertStorageWritableForRegeneration(savePath);

    expect(statSync(path.join(savePath, 'rootCA-key.pem')).mode % 0o1000).toBe(0o600);
    expect(statSync(path.join(savePath, 'dev.key')).mode % 0o1000).toBe(0o600);
  });
});
