type ReportOptions = {
  reportUrl: string;
  name: string;
  /** Milliseconds. */
  duration: number;
  detail: Record<string, string>;
};

/**
 * Fire-and-forget POST of a single metric entry to the telemetry ingest API.
 * Failures are silently swallowed — telemetry loss is acceptable.
 *
 * @param options - Telemetry report configuration including URL, metric name, duration (ms), and attributes
 */
export const reportToApi = (options: ReportOptions): void => {
  const payload = {
    entries: [{ name: options.name, duration: options.duration, detail: options.detail }],
  };

  const send = async () => {
    try {
      await fetch(options.reportUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-blocking — telemetry loss is acceptable
    }
  };

  void send();
};
