/**
 * Field capture for the project-library fast path (blueprint FW0, Method step 4). Tooling only: nothing in the app
 * loads this file.
 *
 * Purpose: record, on the operator's own profile, what the CI budget cannot: whether the folder can be natively
 * observed, what the discovery-wide safety poll costs and how often it runs, and how long one browser file call takes
 * with 4 and with 16 calls in flight.
 *
 * Usage: open the library page on taucad.dev, open DevTools, paste this file into the Console of the page (not the
 * worker) and run `await tauLibraryFastPathCapture()`. Choose the workspace folder (`tau-workspace`) when the picker
 * opens; the capture only reads it. The result is copied to the clipboard as JSON: store it under
 * `research/artifacts/project-library-fast-path/` in Tau Brain, once before FW1 and after FW2 and FW4.
 *
 * Cannot see: what a library mutation costs inside the authority. Its `tau:` spans and `discovery.*` counters are
 * recorded by the file-manager worker's own recorder (`workerTimings`), which no page API exposes, so the page's
 * performance timeline never holds them. To see the spans, select the file-manager worker in the Console's context
 * menu and read `performance.getEntriesByType('measure')` there; the counters need the CI budget
 * (`discovery-budget.test.ts`).
 *
 * Environment: a Chromium browser with the File System Access API. No network request is made, nothing is written,
 * and the JSON carries counts and durations only, never a file or folder name.
 *
 * Exit: the returned promise rejects when the picker is dismissed or the API is missing.
 */
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-return -- An untyped
 * console snippet over browser APIs the DOM lib does not type yet (`showDirectoryPicker`, `FileSystemObserver`). */
// oxlint-disable-next-line no-unused-vars -- Called from the console after pasting.
async function tauLibraryFastPathCapture({ chains = [4, 16], probes = 200 } = {}) {
  /* The file-tree service's cadences in milliseconds (apps/libs/fs-client/src/file-tree-service.ts): a root poll every
   * 2 s focused, 10 s blurred, 60 s under native observation, and a discovery-wide reconcile every fifth tick. */
  const cadence = { focused: 2000, blurred: 10_000, native: 60_000, reconcileEveryTicks: 5 };
  const percentile = (values, fraction) => {
    if (values.length === 0) {
      return undefined;
    }
    const sorted = values.toSorted((left, right) => left - right);
    return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100;
  };
  const summary = (values) => ({
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: percentile(values, 1),
  });

  if (typeof globalThis.showDirectoryPicker !== 'function') {
    throw new TypeError('This capture needs the File System Access API (Chromium).');
  }
  const folder = await globalThis.showDirectoryPicker({ mode: 'read' });

  /* 1. Native observation: whether this browser can observe the folder, as the authority would try. */
  const observer = { available: typeof globalThis.FileSystemObserver === 'function', observed: false };
  if (observer.available) {
    try {
      const probe = new globalThis.FileSystemObserver(() => undefined);
      await probe.observe(folder, { recursive: true });
      observer.observed = true;
      probe.disconnect();
    } catch (error) {
      observer.error = error instanceof Error ? error.name : 'unknown';
    }
  }

  /* 2. The discovery-wide reconcile's walk: list the folder, then each project's two heads (`tau.json` and
   * `.tau/project.json`, read together as external-change-ingest.ts reads them), timed end to end. */
  const projects = [];
  const walkStarted = performance.now();
  for await (const [name, handle] of folder.entries()) {
    if (handle.kind === 'directory' && !name.startsWith('.')) {
      projects.push(handle);
    }
  }
  const heads = async (directory) => {
    const read = async (open) => {
      try {
        const handle = await open();
        const file = await handle.getFile();
        return file.size;
      } catch {
        return undefined;
      }
    };
    await Promise.all([
      read(async () => directory.getFileHandle('tau.json')),
      read(async () => {
        const tau = await directory.getDirectoryHandle('.tau');
        return tau.getFileHandle('project.json');
      }),
    ]);
  };
  for (let offset = 0; offset < projects.length; offset += 16) {
    // oxlint-disable-next-line no-await-in-loop -- The reconcile walks a bounded window at a time.
    await Promise.all(projects.slice(offset, offset + 16).map(async (directory) => heads(directory)));
  }
  /** Milliseconds. */
  const walk = Math.round(performance.now() - walkStarted);
  /** Milliseconds. */
  const reconcilePeriod = (observer.observed ? cadence.native : cadence.focused) * cadence.reconcileEveryTicks;

  /* 3. One browser call's latency with N calls in flight: `getFileHandle`, `getFile`, `arrayBuffer` of `tau.json`,
   * over the first `probes` readable manifests. */
  const latency = {};
  for (const inFlight of chains) {
    const calls = [];
    let next = 0;
    let manifests = 0;
    const chain = async () => {
      while (next < projects.length && manifests < probes) {
        const directory = projects[next];
        next += 1;
        try {
          const durations = [];
          let startedAt = performance.now();
          // oxlint-disable-next-line no-await-in-loop -- One call after another is what a chain is.
          const handle = await directory.getFileHandle('tau.json');
          durations.push(performance.now() - startedAt);
          startedAt = performance.now();
          // oxlint-disable-next-line no-await-in-loop -- As above.
          const file = await handle.getFile();
          durations.push(performance.now() - startedAt);
          startedAt = performance.now();
          // oxlint-disable-next-line no-await-in-loop -- As above.
          await file.arrayBuffer();
          durations.push(performance.now() - startedAt);
          /* Chains in flight together can each finish one more read past the budget; only the first `probes` count. */
          if (manifests < probes) {
            manifests += 1;
            calls.push(...durations);
          }
        } catch {
          /* A directory with no manifest is not a project; it is not timed and does not count toward `probes`. */
        }
      }
    };
    // oxlint-disable-next-line no-await-in-loop -- Each concurrency level is measured alone.
    await Promise.all(Array.from({ length: inFlight }, chain));
    latency[`inFlight${inFlight}`] = { manifests, ...summary(calls) };
  }

  const result = {
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    folder: { directories: projects.length },
    observer,
    discoveryWidePoll: {
      walk,
      reconcilePeriod,
      unit: 'milliseconds',
      periodSource: 'file-tree-service cadence constants, chosen by the observer result',
    },
    browserCallLatency: { unit: 'milliseconds', ...latency },
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(result, undefined, 2));
    console.info('[library-fast-path] Capture copied to the clipboard.');
  } catch {
    console.info('[library-fast-path] Copy the capture from the returned value.');
  }
  return result;
}
