import type { Breadcrumb, Event, SeverityLevel } from '@sentry/react';
import { apiRequestIdTags } from '#lib/api-request-id.js';
import { isWeakKey } from '#lib/weak-key.js';

/*
 * What a reporter knows about an error beyond the error itself (SB4): tags (`worker`, the runtime vocabulary,
 * a revision failure's `code`/`subject`/`operation`), contexts (React's component stack under `react`,
 * `tau.runtime`) and a fingerprint, recorded on the error by `reportUiError` and applied to its event on both
 * delivery paths (principle 7), together with the `api_request_id` of an API failure (SB13).
 */

/** Tags, contexts and grouping one reporter records on an error. */
export type ErrorDetails = Readonly<{
  tags?: Readonly<Record<string, string>>;
  contexts?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Groups the event apart from what its stack alone would group it with. */
  fingerprint?: readonly string[];
  /**
   * How severe the event is, where the reporter knows better than the capture's default: a detected
   * tab kill is a `warning`, a background discard `info`, a kill loop an `error` (SB3).
   */
  level?: SeverityLevel;
  /**
   * The trail to report with the event, in place of this page's own: a kill report replays the
   * breadcrumbs of the page that died, with their original timestamps (SB3).
   */
  breadcrumbs?: readonly Breadcrumb[];
  /**
   * Send the event without `user`: a detected tab kill is usage and diagnostics data, and the telemetry switch
   * promises that such data is not stored against an account (crash capture blueprint, overturning D1 for it alone).
   */
  anonymous?: boolean;
}>;

const recorded = new WeakMap<WeakKey, ErrorDetails>();

/**
 * Record details on an error, merged over what was recorded before. A primitive cannot carry any.
 *
 * @param error - The error a reporter is about to report.
 * @param details - What the reporter knows of it.
 * @returns The same error.
 */
export const recordErrorDetails = <Failure>(error: Failure, details: ErrorDetails): Failure => {
  if (!isWeakKey(error)) {
    return error;
  }
  const previous = recorded.get(error);
  recorded.set(error, {
    tags: { ...previous?.tags, ...details.tags },
    contexts: { ...previous?.contexts, ...details.contexts },
    ...((details.fingerprint ?? previous?.fingerprint) === undefined
      ? {}
      : { fingerprint: details.fingerprint ?? previous?.fingerprint }),
    ...((details.level ?? previous?.level) === undefined ? {} : { level: details.level ?? previous?.level }),
    ...((details.breadcrumbs ?? previous?.breadcrumbs) === undefined
      ? {}
      : { breadcrumbs: details.breadcrumbs ?? previous?.breadcrumbs }),
    ...(details.anonymous === true || previous?.anonymous === true ? { anonymous: true } : {}),
  });
  return error;
};

/**
 * The details of a reported value: what reporters recorded on it, and the `api_request_id` along its `cause` chain.
 *
 * @param error - The reported value.
 * @returns Its tags, contexts, fingerprint, level, trail and anonymity (each possibly absent or empty).
 */
export const readErrorDetails = (error: unknown): ErrorDetails => {
  const own = isWeakKey(error) ? recorded.get(error) : undefined;
  return {
    tags: { ...own?.tags, ...apiRequestIdTags(error) },
    contexts: { ...own?.contexts },
    ...(own?.fingerprint === undefined ? {} : { fingerprint: own.fingerprint }),
    ...(own?.level === undefined ? {} : { level: own.level }),
    ...(own?.breadcrumbs === undefined ? {} : { breadcrumbs: own.breadcrumbs }),
    ...(own?.anonymous === true ? { anonymous: true } : {}),
  };
};

/**
 * The event without `user`.
 *
 * @param event - The event.
 * @returns A copy with no `user` field.
 */
const withoutUser = <Reported extends Event>(event: Reported): Reported => {
  const { user: _user, ...rest } = event;
  return rest as Reported;
};

/**
 * Apply a reported value's details to its event. The event's own tags, contexts and fingerprint win: the SDK and
 * the stale-build decoration set them on purpose. A recorded `level` and trail do win over the event's, because
 * both carry a default the reporter is correcting: every capture is `error` until someone says otherwise, and a
 * kill report's trail belongs to the page that died rather than to the one reporting it (SB3).
 *
 * @param event - The event about to be sent.
 * @param error - The value it reports.
 * @returns The event with the details applied (the same event when there are none).
 */
export const applyErrorDetails = <Reported extends Event>(event: Reported, error: unknown): Reported => {
  const { tags = {}, contexts = {}, fingerprint, level, breadcrumbs, anonymous } = readErrorDetails(error);
  if (anonymous === true && event.user !== undefined) {
    return applyErrorDetails(withoutUser(event), error);
  }
  if (
    Object.keys(tags).length === 0 &&
    Object.keys(contexts).length === 0 &&
    fingerprint === undefined &&
    level === undefined &&
    breadcrumbs === undefined
  ) {
    return event;
  }
  const mergedContexts = { ...contexts, ...event.contexts };
  for (const name of Object.keys(contexts)) {
    // SDK contexts such as react.version must not erase the reporter's componentStack.
    mergedContexts[name] = { ...contexts[name], ...event.contexts?.[name] };
  }
  return {
    ...event,
    tags: { ...tags, ...event.tags },
    contexts: mergedContexts,
    ...(event.fingerprint === undefined && fingerprint !== undefined ? { fingerprint: [...fingerprint] } : {}),
    ...(level === undefined ? {} : { level }),
    ...(breadcrumbs === undefined ? {} : { breadcrumbs: [...breadcrumbs] }),
  };
};

/**
 * Remove `user` from an event whose error a reporter recorded as anonymous. The direct path applies the Tau context
 * (which sets `user.id`) after the reporter's details, so it calls this last; the SDK path needs nothing more,
 * because its event processor runs before `beforeSend`.
 *
 * @param event - The event about to be sent.
 * @param error - The value it reports.
 * @returns The event without `user` when the error is anonymous, else the same event.
 */
export const withoutUserWhenAnonymous = <Reported extends Event>(event: Reported, error: unknown): Reported =>
  readErrorDetails(error).anonymous === true && event.user !== undefined ? withoutUser(event) : event;
