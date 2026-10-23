/**
 * An error reported while the error tracker was unavailable, kept in `sessionStorage` so it survives
 * the page (an automatic reload, a failed SDK load) and is captured once on the next start.
 */
export type QueuedUiError = {
  /** Unique per report: the capture of each is deduplicated by it across pages. */
  readonly id: string;
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  /** Milliseconds since the epoch when it was reported; the event carries this time. */
  readonly time: number;
  /** Tags known for it when it was queued (refreshed before the page goes), such as `stale_build`. */
  readonly tags: Readonly<Record<string, string>>;
};
