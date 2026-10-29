declare const tauBuildFrontendUrl: string;
/** Netlify `CONTEXT` of the web build (`''` elsewhere); read only through `resolveDeployContext` in `environment.config`. */
declare const tauBuildDeployContext: string;
declare const tauBuildId: number;
declare const tauCloudBuildEnabled: boolean;
/** Runtime telemetry's Cloud-host build signal (`TAU_TELEMETRY_HOST=cloud`); read only through `#cloud/telemetry-host`. */
declare const tauTelemetryHostCloudBuild: boolean;
/** The build's release label (short commit or semver); `''` when the build had none. Read through `#lib/build-identity`. */
declare const tauBuildRelease: string;

/*
 * Declaration merging into `vite/client`'s own `ImportMetaEnv` only works with
 * `interface`. As a `type` alias this collapsed the whole shape to `any`, so
 * every `import.meta.env.PROD` / `.DEV` read leaked `any` into its expression.
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- merging into vite/client's `ImportMetaEnv` requires `interface`.
interface ImportMetaEnv {
  /**
   * Compile-time host seam (charter D2). Substituted by `define` in
   * `vite.config.ts` (`'web'`) and `desktop/vite.config.ts` (`'desktop'`);
   * left undefined under `mode === 'test'` so unit tests can stub it.
   */
  readonly TAU_TARGET?: 'web' | 'desktop';
  /**
   * `'absent'` in the web build (`vite.config.ts`), whose origin is the static
   * site and never a `tau serve` daemon, so the page skips asking it for a
   * `/.well-known/tau-host` descriptor. Undefined elsewhere, and under
   * `mode === 'test'`.
   */
  readonly TAU_ORIGIN_AGENT_HOST?: 'absent';
  /**
   * `'true'` once a non-prerelease Tau Desktop release exists to download (charter Q56, go-live DSK-7); `'false'`
   * otherwise. Substituted by `define` in `vite.config.ts` from `TAU_DESKTOP_RELEASED` at build time; undefined
   * under `mode === 'test'` so tests can stub both branches.
   */
  readonly TAU_DESKTOP_RELEASED?: 'true' | 'false';
}

declare module '*?base64' {
  const value: string;
  export = value;
}

declare module 'qrcode-terminal' {
  type QrcodeTerminalGenerateOptions = {
    small?: boolean | undefined;
  };

  const qrcodeTerminal: {
    generate(
      payload: string,
      optionsOrCallback?: QrcodeTerminalGenerateOptions | ((qr: string) => void),
      callback?: (qr: string) => void,
    ): void;
  };

  export default qrcodeTerminal;
}
