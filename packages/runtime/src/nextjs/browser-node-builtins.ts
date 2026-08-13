/* oxlint-disable tau-lint/require-public-export-jsdoc -- Framework-only Node builtin mirror; the module is documented @internal below. */

/**
 * Browser-only Node.js builtin target used by `withTauRuntime()`.
 *
 * CAD dependencies contain dead Node.js branches that framework bundlers
 * still resolve while planning browser-owned runtime workers. This module
 * keeps those graphs buildable and fails clearly if a Node-only branch ever
 * executes in a browser.
 *
 * @internal
 */

type UnavailableMethod = (...args: unknown[]) => never;

const unavailable = (method: string): never => {
  throw new Error(
    `Node ${method}() is unavailable in a Next.js browser runtime worker. ` +
      'This indicates a Node-only code path executed inside the browser worker graph.',
  );
};

const method =
  (name: string): UnavailableMethod =>
  () =>
    unavailable(name);

export const access = method('fs.access');
export const accessSync = method('fs.accessSync');
export const createReadStream = method('fs.createReadStream');
export const createWriteStream = method('fs.createWriteStream');
export const existsSync = method('fs.existsSync');
export const fileURLToPath = method('url.fileURLToPath');
export const mkdir = method('fs.mkdir');
export const mkdirSync = method('fs.mkdirSync');
export const readFile = method('fs.readFile');
export const readFileSync = method('fs.readFileSync');
export const readdir = method('fs.readdir');
export const readdirSync = method('fs.readdirSync');
export const stat = method('fs.stat');
export const statSync = method('fs.statSync');
export const unlink = method('fs.unlink');
export const unlinkSync = method('fs.unlinkSync');
export const writeFile = method('fs.writeFile');
export const writeFileSync = method('fs.writeFileSync');

export const promises = Object.freeze({
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
});

const browserNodeBuiltins = Object.freeze({
  access,
  accessSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fileURLToPath,
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

export default browserNodeBuiltins;
