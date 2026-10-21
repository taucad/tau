/** Main-owned desktop update state shared with the isolated renderer bridge. */
export type DesktopUpdateSnapshot = {
  readonly revision: number;
  readonly requestId: number;
  readonly phase:
    | 'system-managed'
    | 'disabled'
    | 'checking'
    | 'current'
    | 'downloading'
    | 'ready'
    | 'available'
    | 'error'
    | 'saving'
    | 'restart-blocked'
    | 'restarting';
  readonly currentVersion: string;
  readonly channel: 'staging' | 'production';
  readonly version?: string;
  readonly releasePage?: string;
  /** Whether an already downloaded update also installs on ordinary quit (macOS only). */
  readonly installOnQuit?: boolean;
  /** Main-owned status for system policy and installation failures. */
  readonly detail?: string;
};

/** Fixed IPC routes; the renderer cannot select update feeds or install paths. */
export const desktopUpdateChannels = {
  snapshot: 'tau:updates:snapshot',
  changed: 'tau:updates:changed',
  check: 'tau:updates:check',
  install: 'tau:updates:install',
  download: 'tau:updates:download',
} as const;

/** Narrow capabilities exposed by Electron's preload. */
export type DesktopUpdateBridge = {
  snapshot(): Promise<DesktopUpdateSnapshot>;
  subscribe(listener: (snapshot: DesktopUpdateSnapshot) => void): () => void;
  check(): Promise<void>;
  install(): Promise<void>;
  download(): Promise<void>;
};
