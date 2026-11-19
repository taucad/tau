import type { CadmpegEngines } from '@taucad/cadmpeg';

declare const tauCadmpegEngines: CadmpegEngines | undefined;

/**
 * Place the build's engine source: a same-origin path (`/cadmpeg-ts/`, development) under the app base, a dependency
 * host (`https://…/`) as it is.
 *
 * @param defined - The engine source the build defined, if any.
 * @param base - The app's base URL, ending in `/`.
 * @returns The `engines` option of the cadmpeg kernel.
 */
export const placeCadmpegEngines = (defined: CadmpegEngines | undefined, base: string): CadmpegEngines | undefined =>
  defined &&
  (defined.baseUrl.startsWith('/') ? { ...defined, baseUrl: `${base}${defined.baseUrl.slice(1)}` } : defined);

/**
 * Where this build loads the cadmpeg engines from (cadmpeg engine delivery charter D11, D12): the environment's
 * dependency host by digest on tau.new and staging, the installed package same-origin in development, and nothing
 * otherwise, so the browser kernel reports `KERNEL_NOT_PREPARED`. The identity of each engine comes from the installed
 * `cadmpeg-ts`, never from here.
 *
 * @returns The `engines` option, or nothing when the build defined no source.
 */
export const cadmpegEngines = (): CadmpegEngines | undefined =>
  placeCadmpegEngines(
    // oxlint-disable-next-line unicorn/no-typeof-undefined -- Vite injects this identifier; source-only consumers do not define it.
    typeof tauCadmpegEngines === 'undefined' ? undefined : tauCadmpegEngines,
    import.meta.env.BASE_URL,
  );
