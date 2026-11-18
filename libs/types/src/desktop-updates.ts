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
    | 'restarting'
    /** On macOS: an update exists, but this copy of Tau runs where it cannot be replaced (Downloads, a disk image). */
    | 'move-required';
  readonly currentVersion: string;
  readonly channel: 'staging' | 'production';
  readonly version?: string;
  readonly releasePage?: string;
  /** Whether an already downloaded update also installs on ordinary quit (macOS only). */
  readonly installOnQuit?: boolean;
  /**
   * The user asked to restart before the download finished, so main saves and restarts as soon as it does.
   * Only a user gesture sets it; a background download never does.
   */
  readonly installWhenReady?: boolean;
  /** Main-owned wording for the one state the renderer cannot word itself: an update APT already installed. */
  readonly detail?: string;
  /**
   * Why the updater cannot go on by itself, when the cause is one a person can act on: the computer's clock refused
   * the update (`clock`), or this copy's installation marker is damaged and it cannot update itself
   * (`installation-marker`). Absent for every other state.
   */
  readonly blockedReason?: 'clock' | 'installation-marker';
  /** Where **Download Tau** goes: the offered release's page, or the channel's release page on GitHub. */
  readonly downloadPage: string;
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
