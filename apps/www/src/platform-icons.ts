import { platformLogos } from '@taucad/ui-kit/icons/platform-logos';
import type { DesktopPlatform } from '@taucad/ui-kit/icons/platform-logos';

/** Markup for one shared mark, as the download buttons inline it. */
const markup = (platform: DesktopPlatform): string =>
  `<svg viewBox="${platformLogos[platform].viewBox}" aria-hidden="true" focusable="false" fill="currentColor"><path d="${platformLogos[platform].path}"/></svg>`;

/** Font Awesome Free 6.7.2 brand icons, CC BY 4.0, from `@taucad/ui-kit/icons/platform-logos`. See THIRD_PARTY_LICENSES.txt. */
export const platformIcons: Readonly<Record<DesktopPlatform, string>> = {
  apple: markup('apple'),
  windows: markup('windows'),
  linux: markup('linux'),
};
