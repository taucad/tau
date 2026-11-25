// Fixtures of the services host's runtime telemetry tests (T19): an API origin that records everything, standing in
// for the only network the utility's reporter reaches. Each POST is kept so a case can read what was sent.
import type { ServicesHostOptions } from '#services-host.impl.js';

type PostedEntry = Readonly<{ name: string; detail: Record<string, unknown> }>;
type Posted = Readonly<{ entries: readonly PostedEntry[] }>;

/** The recording API: the option it serves and what it was sent. */
export type RecordingTelemetryApi = Readonly<{
  runtimeTelemetry: NonNullable<ServicesHostOptions['runtimeTelemetry']>;
  /** Every POST the reporter made. */
  posts: () => readonly Posted[];
  /** The `runtime.operation` entries it posted. */
  operations: () => readonly PostedEntry[];
}>;

const urlOf = (url: string | URL | Request): string =>
  typeof url === 'string' ? url : 'href' in url ? url.href : url.url;

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/**
 * An API whose telemetry policy is `on` and whose account allows usage metrics.
 *
 * @param configDirectory - Where `tau telemetry on|off` would be read; nothing is written there.
 * @returns The services host's `runtimeTelemetry` option and the `runtime.operation` entries it posted.
 */
export const recordingTelemetryApi = (configDirectory: string): RecordingTelemetryApi => {
  const posts: Posted[] = [];
  const send: typeof globalThis.fetch = async (url, init) => {
    const target = urlOf(url);
    if (init?.method === 'POST') {
      posts.push(JSON.parse(init.body as string) as Posted);
      return json({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
    }
    if (target.endsWith('/v1/privacy')) {
      return json({ allowsAiTraining: false, allowsUsageMetrics: true });
    }
    return json({ policy: 'on', maxAge: 900 });
  };
  const runtimeTelemetry: NonNullable<ServicesHostOptions['runtimeTelemetry']> = {
    apiOrigin: 'https://api.test',
    release: '1.2.3',
    configDir: configDirectory,
    cloudBuild: false,
    /* Not the test process's: a `CI` variable would make this host not a Tau Cloud host. */
    env: {},
    fetch: send,
  };
  return {
    runtimeTelemetry,
    posts: () => posts,
    operations: () => posts.flatMap(({ entries }) => entries).filter(({ name }) => name === 'runtime.operation'),
  };
};
