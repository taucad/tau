/**
 * The PostHog side of a Sentry event (browser observability SB7, A8): links to the person and the
 * session replay the event happened in, so an engineer can watch what led up to it.
 *
 * PostHog keeps no copy of the exception (D4); only these links cross over. The PostHog lifecycle
 * installs a source while it is capturing, and removes it on withdrawal, so an event from a session
 * that did not allow analytics carries no PostHog field at all. Sentry reads it through
 * {@link applyAnalyticsLink} and never imports the analytics SDK.
 */

/** The links for the current moment, or `undefined` when PostHog is not capturing. */
export type AnalyticsLink = Readonly<{ personUrl: string; replayUrl?: string }>;

type AnalyticsLinkSource = () => AnalyticsLink | undefined;

let source: AnalyticsLinkSource | undefined;

/**
 * Install (or remove) the source of PostHog links.
 *
 * @param next - Reads the links at event time, or `undefined` once analytics stops.
 */
export const setAnalyticsLinkSource = (next: AnalyticsLinkSource | undefined): void => {
  source = next;
};

/** The event fields this module writes. */
type LinkableEvent = {
  tags?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown> | undefined>;
};

/**
 * Add the PostHog person and replay links to an event, while PostHog is capturing.
 *
 * @param event - The Sentry event about to be sent.
 * @returns The same event, with a `posthog` context and tags when a source is installed.
 */
export const applyAnalyticsLink = <Event extends LinkableEvent>(event: Event): Event => {
  let link: AnalyticsLink | undefined;
  try {
    link = source?.();
  } catch {
    // A link is a convenience: never let it cost the error report.
    return event;
  }
  if (link === undefined) {
    return event;
  }
  /* eslint-disable @typescript-eslint/naming-convention -- Sentry tag and context keys, shown as written. */
  return {
    ...event,
    tags: {
      ...event.tags,
      'posthog.person_url': link.personUrl,
      ...(link.replayUrl === undefined ? {} : { 'posthog.replay_url': link.replayUrl }),
    },
    contexts: {
      ...event.contexts,
      posthog: {
        person_url: link.personUrl,
        ...(link.replayUrl === undefined ? {} : { replay_url: link.replayUrl }),
      },
    },
  };
  /* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
};
