import type { WorkspaceFileService } from '#workspace-file-service.js';

/**
 * One kernel typings entry mirrored under `/node_modules/<packageName>/` in the worker.
 *
 * @public
 */
export type BundledTypesMountEntry = Readonly<{
  packageName: string;
  content: string;
  /** When true, `content` is emitted verbatim (already `declare module` or ambient). */
  prewrapped?: boolean;
}>;

/**
 * Payload posted from the main thread after the FM worker mounts `/node_modules`.
 *
 * @public
 */
export type BundledTypesPayload = readonly BundledTypesMountEntry[];

function declarationSource(entry: BundledTypesMountEntry): string {
  return entry.prewrapped ? entry.content : `declare module '${entry.packageName}' {\n${entry.content}\n}`;
}

function bytesEqual(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

async function readFileBytes(
  service: WorkspaceFileService,
  path: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    const data = await service.readFile(path);
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }

    return data;
  } catch {
    return undefined;
  }
}

/**
 * Writes bundled `.d.ts` + minimal `package.json` under `/node_modules/<pkg>/`.
 * Skips writes when existing bytes match (idempotent across reloads).
 *
 * @param fileService - Workspace file service used for idempotent writes.
 * @param payload - Kernel typings entries to mirror under `/node_modules`.
 * @public
 */
export async function populateBundledTypesMount(
  fileService: WorkspaceFileService,
  payload: BundledTypesPayload,
): Promise<void> {
  await Promise.all(
    payload.map(async (entry) => {
      const declarationTypesPath = `/node_modules/${entry.packageName}/index.d.ts`;
      const packageJsonPath = `/node_modules/${entry.packageName}/package.json`;
      const source = declarationSource(entry);
      const expectedDeclarationBytes = new TextEncoder().encode(source);
      const packageJsonText = JSON.stringify({ name: entry.packageName, types: 'index.d.ts' });
      const expectedPackageJsonBytes = new TextEncoder().encode(packageJsonText);

      const existingDeclaration = await readFileBytes(fileService, declarationTypesPath);
      if (existingDeclaration === undefined || !bytesEqual(existingDeclaration, expectedDeclarationBytes)) {
        await fileService.writeFile(declarationTypesPath, source);
      }

      const existingPackageJson = await readFileBytes(fileService, packageJsonPath);
      if (existingPackageJson === undefined || !bytesEqual(existingPackageJson, expectedPackageJsonBytes)) {
        await fileService.writeFile(packageJsonPath, packageJsonText);
      }
    }),
  );
}
