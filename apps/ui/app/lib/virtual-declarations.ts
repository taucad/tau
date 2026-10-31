/**
 * Library declarations that language services serve from memory rather than the project filesystem:
 * TypeScript lib and package types, C# metadata, the KCL standard library and OpenSCAD built-ins.
 * They open as read-only editor tabs, are never saved or persisted, and carry no diagnostics.
 */
export type VirtualDeclarationRoot = Readonly<{
  /** Workspace-relative prefix the language service uses in its `file:///` URIs. */
  prefix: string;
  extension: string;
  /** What the reader is looking at, for the tab and breadcrumb. */
  label: string;
}>;

export const virtualDeclarationRoots: readonly VirtualDeclarationRoot[] = [
  { prefix: '__typescript_lib__/', extension: '.d.ts', label: 'TypeScript library' },
  { prefix: 'cdn-types/', extension: '.d.ts', label: 'Package types' },
  { prefix: '__csharp_metadata__/', extension: '.cs', label: 'C# metadata' },
  { prefix: '__kcl_std__/', extension: '.kcl', label: 'KCL standard library' },
  { prefix: '__openscad_builtins__/', extension: '.scad', label: 'OpenSCAD built-ins' },
];

/** The root a workspace-relative path belongs to, if it names a library declaration. */
export function virtualDeclarationRoot(path: string): VirtualDeclarationRoot | undefined {
  return virtualDeclarationRoots.find((root) => path.startsWith(root.prefix) && path.endsWith(root.extension));
}

export function isVirtualDeclarationPath(path: string): boolean {
  return virtualDeclarationRoot(path) !== undefined;
}

/** Whether a `file:///` URI names a library declaration. */
export function isVirtualDeclarationUri(uri: string): boolean {
  const prefix = 'file:///';
  return uri.startsWith(prefix) && isVirtualDeclarationPath(decodeURIComponent(uri.slice(prefix.length)));
}
