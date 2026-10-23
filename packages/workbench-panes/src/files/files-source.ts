/**
 * One file or folder the Files pane lists.
 *
 * @public
 */
export type FilesEntry = Readonly<{
  name: string;
  /** Project-relative POSIX path. */
  path: string;
  isFolder: boolean;
  /** Bytes, for a file whose size the source knows. */
  size?: number | undefined;
  /** Whether the view can show the file; the pane lists every file and disables one that is `false`. */
  renderable?: boolean | undefined;
}>;

/**
 * What the Files pane needs from its host: the project's files, the file the view shows, and how to show another.
 * Each host (the Tau app, the agent plugin viewer) implements it over its own file listing.
 *
 * @public
 */
export type FilesSource = Readonly<{
  /**
   * List one folder's children.
   *
   * @param path - Project-relative folder path; `''` for the project root.
   * @returns The folder's files and folders.
   */
  loadDirectory: (path: string) => Promise<readonly FilesEntry[]>;
  /**
   * Find the files a query names, ignoring case, anywhere in the project.
   *
   * @param query - The text the person typed.
   * @returns The matching files.
   */
  searchFiles: (query: string) => Promise<readonly FilesEntry[]>;
  /**
   * Observe list changes (plugin: `filesVersion`; desktop: tree-index events); the pane lists again at each.
   *
   * @param listener - Called once per change.
   * @returns Stops observing.
   */
  subscribe?: ((listener: () => void) => () => void) | undefined;
  /** The path the viewer shows, highlighted. A hook: it is called during render. */
  useActivePath?: (() => string | undefined) | undefined;
  /**
   * Open a file in this view only (plugin: `app_open_file`; desktop: `openInViewer` or the editor).
   *
   * @param path - The file's project-relative path.
   * @returns Settles once the file is shown; rejects with the reason it could not be.
   */
  openFile: (path: string) => Promise<void> | void;
}>;
