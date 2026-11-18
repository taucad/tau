/**
 * Whether and where the web app offers Tau Desktop. Kept apart from the `OpenInDesktop` component so a page that only
 * asks whether to offer the app (the sidebar's desktop notice on every page, the project notices, the desktop sign-in
 * page) does not load that component and its card, checkbox and deep-link code.
 *
 * @module
 */

/**
 * Where "Get Tau Desktop" goes.
 *
 * The same destination the in-app `Get Tau Desktop` action already opens
 * (`routes/w.$workspace.$project/project-route-notices.tsx`). The release
 * workflow marks only a desktop release "latest", and only once its archives
 * are attached, so this page always offers a complete download.
 */
export const tauDesktopDownloadUrl = 'https://github.com/taucad/tau/releases/latest';

/**
 * Whether a non-prerelease desktop release exists to download (charter Q56, go-live DSK-7).
 *
 * `releases/latest` answers 404 until the first one is published, so every "Get Tau Desktop" offer stays hidden
 * until the build says otherwise: `TAU_DESKTOP_RELEASED=true` at build time, substituted by `define` in
 * `vite.config.ts`. A function, not a constant, so tests can `vi.stubEnv` both branches.
 *
 * @returns Whether to offer the desktop download.
 */
export const isTauDesktopReleased = (): boolean => import.meta.env.TAU_DESKTOP_RELEASED === 'true';
