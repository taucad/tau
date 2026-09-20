import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Repository root for the source harness, independent of the invoking cwd. @internal */
export const fixtureWorkspaceRoot = resolve(import.meta.dirname, '../../../..');

const manifest = /** @type {{ files: Record<string, { path: string, byteLength: number, sha256: string }> }} */ (
  /** @type {unknown} */ (JSON.parse(readFileSync(new URL('manifest.json', import.meta.url), 'utf8')))
);

/**
 * Locate retained bytes by their original repository-relative authority identity.
 * @internal
 * @type {(originalPath: string, workspaceRoot?: string) => string}
 * @param originalPath - Unchanged path from the source authority.
 * @param workspaceRoot - Repository containing the retained fixture closure.
 * @returns Local path; no Brain/cache fallback.
 */
export function fixturePath(originalPath, workspaceRoot = fixtureWorkspaceRoot) {
  const record = manifest.files[originalPath];
  assert.ok(record, `Unregistered fixture: ${originalPath}`);
  return resolve(workspaceRoot, record.path);
}

/**
 * Read exact frozen bytes without changing embedded source paths or expected results.
 * @internal
 * @type {(originalPath: string, workspaceRoot?: string) => Buffer}
 * @param originalPath - Unchanged path from the source authority.
 * @param workspaceRoot - Repository containing the retained fixture closure.
 * @returns Hash-checked original bytes.
 */
export function readFixture(originalPath, workspaceRoot = fixtureWorkspaceRoot) {
  const bytes = readFileSync(fixturePath(originalPath, workspaceRoot));
  const record = manifest.files[originalPath];
  assert.equal(bytes.byteLength, record.byteLength, `Fixture length changed: ${originalPath}`);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    record.sha256,
    `Fixture hash changed: ${originalPath}`,
  );
  return bytes;
}
