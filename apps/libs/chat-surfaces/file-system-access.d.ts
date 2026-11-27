/*
 * File System Access API members Chromium ships and `lib.dom.d.ts` does not
 * declare yet, mirroring `../files-ui/file-system-access.d.ts` for this
 * library's own typecheck of `@taucad/files-ui/filesystem/handle-store`,
 * which `chat-markdown-hyperlink` imports. Methods only: duplicate interface
 * methods merge as overloads when the app compiles these sources, where a
 * duplicate type alias would collide.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
 */

// oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- Extending a global interface.
interface FileSystemDirectoryHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

// oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- Extending a global interface.
interface Window {
  showDirectoryPicker(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}
