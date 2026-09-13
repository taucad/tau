import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

/** @type {(name: string) => string} */
const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

/** @type {(bytes: Uint8Array<ArrayBuffer>) => string} */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** @type {(path: string, displayPath: string) => {path: string, byteLength: number, sha256: string}} */
const fileRecord = (path, displayPath) => {
  const bytes = readFileSync(path);
  return { path: displayPath, byteLength: bytes.byteLength, sha256: sha256(bytes) };
};

/** @type {(root: string) => (ReturnType<typeof fileRecord> | {path: string, symlinkTarget: string})[]} */
const walk = (root) => {
  /** @type {(ReturnType<typeof fileRecord> | {path: string, symlinkTarget: string})[]} */
  const files = [];
  /** @type {(path: string) => void} */
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      files.push({ path: relative(root, path), symlinkTarget: realpathSync(path) });
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort((left, right) => left.localeCompare(right))) {
        visit(join(path, entry));
      }
      return;
    }
    if (stat.isFile()) {
      files.push(fileRecord(path, relative(root, path)));
    }
  };
  visit(root);
  return files;
};

// The frozen execution recipe supplies JSON arrays of file/root path strings.
// These annotations preserve JSON.parse failures and the existing path checks.
const files = /** @type {string[]} */ (JSON.parse(requiredEnvironment('GEOSPEC_MANIFEST_FILES'))).map((path) => {
  const absolute = resolve(path);
  return fileRecord(absolute, absolute);
});
const roots = /** @type {string[]} */ (JSON.parse(requiredEnvironment('GEOSPEC_MANIFEST_ROOTS'))).map((path) => {
  const absolute = resolve(path);
  return { name: basename(absolute), path: absolute, files: walk(absolute) };
});

writeFileSync(
  requiredEnvironment('GEOSPEC_SOURCE_MANIFEST'),
  `${JSON.stringify({ schemaVersion: 1, taskId: 'W7-W8-AUTHORED-CORPUS-B19-A1', files, roots }, null, 2)}\n`,
);
