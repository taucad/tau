import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { createNativeProjectTrustStore } from '#main/native-project-trust.js';

const roots: string[] = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'tau-native-trust-test-'));
  roots.push(root);
  const project = join(root, 'project');
  mkdirSync(project);
  const options = { storePath: join(root, 'grants.json'), markerRoot: join(root, 'markers') };
  return { project, options };
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('native project trust', () => {
  it('denies by default, persists a physical grant, and revokes its marker', () => {
    const { project, options } = fixture();
    const trust = createNativeProjectTrustStore(options);
    expect(trust.isTrusted(project)).toBe(false);

    trust.grant(project);
    const marker = trust.markerPath(project);
    expect(trust.isTrusted(project)).toBe(true);
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual({ version: 1, trusted: true });
    expect(createNativeProjectTrustStore(options).isTrusted(project)).toBe(true);

    trust.revoke(project);
    expect(trust.isTrusted(project)).toBe(false);
    expect(existsSync(marker)).toBe(false);
  });

  it('invalidates trust and the live marker when the directory identity changes', () => {
    const { project, options } = fixture();
    const trust = createNativeProjectTrustStore(options);
    trust.grant(project);
    const oldMarker = trust.markerPath(project);
    rmSync(project, { recursive: true });
    mkdirSync(project);

    expect(trust.isTrusted(project)).toBe(false);
    expect(existsSync(oldMarker)).toBe(false);
  });
});
