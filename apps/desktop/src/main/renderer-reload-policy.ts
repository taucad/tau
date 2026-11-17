/**
 * The renderer reload policy (B11, D0): what main does when the app window's renderer dies.
 *
 * Reloading the same address after every death reopens whatever killed the page, for ever. The policy reloads once,
 * sends a second death within 60 s to Home, and stops after a third within 5 minutes so the recovery window can take
 * over. Five quiet minutes forget every death. Times come from a monotonic clock, so a clock change cannot reset or
 * trigger a step.
 *
 * Pure apart from the clock: `main.ts` acts on the step.
 */

/** What main does after one death. */
export type RendererReloadStep = 'reload' | 'home' | 'stop';

/** Milliseconds: a second death within `home` loads Home; a third within `stop` stops reloading. */
export const rendererReloadWindows = { home: 60_000, stop: 300_000 } as const;

/** One decision, and the death times it remembers for the next. */
export type RendererReloadDecision = {
  readonly step: RendererReloadStep;
  /** Deaths within the last five minutes, this one included. */
  readonly count: number;
  readonly deaths: readonly number[];
};

/**
 * Decide what one death leads to.
 *
 * @param previous - Earlier death times, oldest first.
 * @param at - This death's time, on the same clock.
 * @returns The step, the count and the death times to remember.
 */
export const rendererReloadStep = (previous: readonly number[], at: number): RendererReloadDecision => {
  const deaths = [...previous.filter((time) => at - time <= rendererReloadWindows.stop), at];
  const count = deaths.length;
  if (count >= 3) {
    return { step: 'stop', count, deaths };
  }
  const before = deaths.at(-2);
  if (before !== undefined && at - before <= rendererReloadWindows.home) {
    return { step: 'home', count, deaths };
  }
  return { step: 'reload', count, deaths };
};

/** One window's policy, keeping its own death times. */
export type RendererReloadPolicy = {
  /**
   * The renderer went.
   *
   * @param reason - Electron's `render-process-gone` reason.
   * @returns The decision, or nothing for a clean exit, which is not a death.
   */
  readonly gone: (reason: string) => RendererReloadDecision | undefined;
};

/**
 * Create one window's policy.
 *
 * @param clock - The monotonic clock, in milliseconds.
 * @param clock.now - Read the clock.
 * @returns The policy.
 */
export const createRendererReloadPolicy = ({ now }: { readonly now: () => number }): RendererReloadPolicy => {
  let deaths: readonly number[] = [];
  return {
    gone: (reason) => {
      if (reason === 'clean-exit') {
        return undefined;
      }
      const decision = rendererReloadStep(deaths, now());
      ({ deaths } = decision);
      return decision;
    },
  };
};

const appTitleSuffix = /\s*·\s*Tau$/u;

/**
 * Name the page a second death closed, for the notice on Home. It stays on this computer: nothing here is reported.
 *
 * @param url - The dead page's address.
 * @param title - Its last document title, if any.
 * @returns A name to show the person.
 */
export const closedPageName = (url: string, title: string | undefined): string => {
  let path: string | undefined;
  try {
    path = new URL(url).pathname;
  } catch {
    // An address that does not parse names nothing.
  }
  if (path === '/') {
    return 'Home';
  }
  const name = title?.replace(appTitleSuffix, '').trim();
  if (path === undefined || !name || name === 'Tau') {
    return 'The page that was open';
  }
  return `“${name}”`;
};
