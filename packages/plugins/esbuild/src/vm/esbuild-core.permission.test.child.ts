/* Run by `esbuild-core.permission.test.ts` under `--permission`: Node strips the TypeScript itself, because a loader
 * such as `@oxc-node/core/register` runs its hooks on a worker thread, which the permission model refuses as it refuses
 * esbuild's service process. A module, not `--eval`: `--eval` exposes Node's built-in modules as globals, which
 * esbuild-wasm's in-thread glue would then write its protocol through. */
import { getEsbuild, initializeEsbuild } from '#vm/esbuild-core.js';

await initializeEsbuild();
const { code } = await getEsbuild().transform('const answer: number = 42; export default answer;', { loader: 'ts' });
process.stdout.write(code);
