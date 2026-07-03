/**
 * Browser-only `fs` target used by `nextRuntimeConfig()`.
 *
 * Some CAD libraries still ship browser bundles with dead Node.js branches.
 * Turbopack resolves those branches while planning app-owned runtime workers,
 * even though they are never executed in the browser. This module makes that
 * graph explicit without pretending browser workers have a filesystem.
 *
 * @internal
 */

type UnavailableMethod = (...args: unknown[]) => never;

const unavailable = (method: string): never => {
  throw new Error(
    `Node fs.${method}() is unavailable in a Next.js browser runtime worker. ` +
      'This indicates a Node-only code path executed inside the browser worker graph.',
  );
};

const method =
  (name: string): UnavailableMethod =>
  () =>
    unavailable(name);

export const access = method('access');
export const accessSync = method('accessSync');
export const createReadStream = method('createReadStream');
export const createWriteStream = method('createWriteStream');
export const existsSync = method('existsSync');
export const mkdir = method('mkdir');
export const mkdirSync = method('mkdirSync');
export const readFile = method('readFile');
export const readFileSync = method('readFileSync');
export const readdir = method('readdir');
export const readdirSync = method('readdirSync');
export const stat = method('stat');
export const statSync = method('statSync');
export const unlink = method('unlink');
export const unlinkSync = method('unlinkSync');
export const writeFile = method('writeFile');
export const writeFileSync = method('writeFileSync');

export const promises = Object.freeze({
  access: method('promises.access'),
  mkdir: method('promises.mkdir'),
  readFile: method('promises.readFile'),
  readdir: method('promises.readdir'),
  stat: method('promises.stat'),
  unlink: method('promises.unlink'),
  writeFile: method('promises.writeFile'),
});

const fsUnavailable = Object.freeze({
  access,
  accessSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdir,
  mkdirSync,
  promises,
  readFile,
  readFileSync,
  readdir,
  readdirSync,
  stat,
  statSync,
  unlink,
  unlinkSync,
  writeFile,
  writeFileSync,
});

export default fsUnavailable;
