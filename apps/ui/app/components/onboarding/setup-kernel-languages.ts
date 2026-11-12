/**
 * Which of setup's languages have a kernel on this host and on the desktop app (Finding 2), from the same two inputs
 * the kernel program gives the prompt: the kernel catalog's language per kernel, and the kernels this host can run.
 */
import { kernelConfigurations } from '@taucad/types/constants';
import type { CodeLanguage } from '@taucad/types';
import type { LanguageId } from '@taucad/preferences';
import { availableKernelConfigurations } from '#constants/available-kernel-configurations.js';
import { isDesktopTarget } from '#lib/build-target.js';
import type { KernelLanguages } from '#components/onboarding/setup-model.js';

/** The catalog languages each setup language covers. */
const catalogLanguages: Readonly<Record<Exclude<LanguageId, 'none'>, readonly CodeLanguage[]>> = {
  typescript: ['typescript', 'tsx', 'javascript', 'jsx'],
  python: ['python'],
  openscad: ['openscad'],
  csharp: ['csharp'],
};

const languagesOf = (kernels: ReadonlyArray<Readonly<{ language: CodeLanguage }>>): ReadonlySet<LanguageId> => {
  const present = new Set(kernels.map(({ language }) => language));
  return new Set(
    (Object.entries(catalogLanguages) as Array<[Exclude<LanguageId, 'none'>, readonly CodeLanguage[]]>)
      .filter(([, covered]) => covered.some((language) => present.has(language)))
      .map(([id]) => id),
  );
};

/**
 * The kernel facts for this host. Every catalog kernel runs in the desktop app (native ones need it), so the desktop
 * set is the catalog's.
 *
 * @returns Which languages have a kernel here and on the desktop.
 */
export const readKernelLanguages = (): KernelLanguages => ({
  host: isDesktopTarget() ? 'desktop' : 'browser',
  onHost: languagesOf(availableKernelConfigurations()),
  onDesktop: languagesOf(kernelConfigurations),
});
